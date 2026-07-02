import { prisma } from '../../config/database'
import { AppError } from '../../utils/AppError'
import { uploadToS3 } from '../../utils/storage'
import { notifyContacts, notifyOwnerOfScan, sendHospitalPreAlert } from '../../utils/notifications'
import { addTimelineEntry } from '../../utils/timeline'
import { callAiService } from '../../utils/aiClient'
import { auditLog } from '../../utils/audit'
import { logger } from '../../config/logger'
import { generateIncidentId, generateShareToken } from '../../utils/incidentId'

// ─────────────────────────────────────────────────────────────────
// STEP 1A: QR scanned
// ─────────────────────────────────────────────────────────────────
export async function handleQrScan(qrToken: string, scannerIp?: string) {
  const qrCode = await prisma.qrCode.findUnique({
    where: { token: qrToken, isActive: true },
    include: {
      vehicle: {
        select: {
          id: true,
          vehicleNumber: true,
          vehicleType: true,
          make: true,
          model: true,
          color: true,
          userId: true,
        },
      },
    },
  })

  if (!qrCode) throw new AppError('Invalid or inactive QR code', 404)

  // Abuse detection
  const recentScans = await prisma.emergencyEvent.count({
    where: {
      qrCodeId: qrCode.id,
      createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
  })
  if (recentScans > 50) {
    logger.warn('QR abuse detected', { qrCodeId: qrCode.id, scannerIp, recentScans })
    await auditLog(null, 'QR_ABUSE_DETECTED', 'QrCode', qrCode.id, scannerIp, { recentScans })
  }

  await prisma.qrCode.update({
    where: { id: qrCode.id },
    data: { scanCount: { increment: 1 }, lastScannedAt: new Date() },
  })

  await auditLog(null, 'QR_SCANNED', 'QrCode', qrCode.id, scannerIp)

  return {
    qrCodeId: qrCode.id,
    vehicle: qrCode.vehicle,
    accessMethod: 'QR_SCAN' as const,
  }
}

// ─────────────────────────────────────────────────────────────────
// STEP 1B: Alternative — search by vehicle number plate or mobile
// ─────────────────────────────────────────────────────────────────
export async function findVehicleByPlateOrMobile(input: {
  vehicleNumber?: string
  mobile?: string
  accessorIp?: string
}) {
  let vehicle = null

  if (input.vehicleNumber) {
    const cleaned = input.vehicleNumber.toUpperCase().replace(/\s+/g, '')
    vehicle = await prisma.vehicle.findFirst({
      where: { vehicleNumber: cleaned, isActive: true },
      include: {
        qrCode: { select: { id: true, isActive: true } },
        user: { select: { phone: true } },
      },
    })
  } else if (input.mobile) {
    const user = await prisma.user.findFirst({
      where: { phone: input.mobile, isActive: true },
      include: {
        vehicles: {
          where: { isActive: true },
          include: { qrCode: { select: { id: true, isActive: true } } },
          take: 1,
        },
      },
    })
    if (user?.vehicles?.[0]) vehicle = { ...user.vehicles[0], user: { phone: user.phone } }
  }

  if (!vehicle) {
    throw new AppError('No registered vehicle found. Check the number plate or mobile number.', 404)
  }

  await auditLog(
    null,
    'PLATE_SEARCH',
    'Vehicle',
    vehicle.id,
    input.accessorIp,
    { vehicleNumber: input.vehicleNumber, mobile: input.mobile }
  )

  return {
    vehicleId: vehicle.id,
    qrCodeId: (vehicle as any).qrCode?.id ?? null,
    vehicle: {
      id: vehicle.id,
      vehicleNumber: vehicle.vehicleNumber,
      vehicleType: vehicle.vehicleType,
      make: (vehicle as any).make,
      model: (vehicle as any).model,
      color: (vehicle as any).color,
      userId: vehicle.userId,
    },
    accessMethod: input.vehicleNumber ? ('PLATE_SEARCH' as const) : ('MOBILE_SEARCH' as const),
  }
}

// ─────────────────────────────────────────────────────────────────
// Abuse / misuse tracking
// A bystander phone or device reporting many DIFFERENT vehicles in a short
// window is a strong misuse signal (e.g. someone repeatedly triggering a
// QR on a bike that isn't theirs). We don't block the report — safety comes
// first — but we flag it for admin review and record everything needed to
// trace who authenticated it later (phone, IP, device id, OTP timestamp).
// ─────────────────────────────────────────────────────────────────
async function checkBystanderAbuse(phone: string | undefined, ip: string | undefined, vehicleId: string | null) {
  if (!phone && !ip) return { flagged: false, reason: null as string | null }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const orConds = [phone ? { bystanderPhone: phone } : undefined, ip ? { bystanderIp: ip } : undefined].filter(Boolean) as any[]
  const recent = await prisma.emergencyEvent.findMany({
    where: { createdAt: { gte: since }, OR: orConds },
    select: { vehicleId: true, qrCodeId: true },
  })

  const distinctVehicles = new Set(recent.map(r => r.vehicleId ?? r.qrCodeId).filter(Boolean))
  if (vehicleId) distinctVehicles.add(vehicleId)

  if (distinctVehicles.size > 3) {
    return { flagged: true, reason: `Same bystander phone/IP reported ${distinctVehicles.size} different vehicles in 24h` }
  }
  if (recent.length > 8) {
    return { flagged: true, reason: `Same bystander phone/IP filed ${recent.length} emergency reports in 24h` }
  }
  return { flagged: false, reason: null }
}

// ─────────────────────────────────────────────────────────────────
// STEP 2: Create emergency event
// Authentication is now: bystander mobile number + OTP + live GPS.
// (Accident photo / selfie capture removed — every second matters, and
// requiring photos before the family is alerted was the main source of delay.)
// ─────────────────────────────────────────────────────────────────
export async function createEmergencyEvent(input: {
  vehicleId?: string
  qrCodeId?: string
  accessMethod: 'QR_SCAN' | 'PLATE_SEARCH' | 'MOBILE_SEARCH'
  bystanderName?: string
  bystanderPhone: string
  bystanderDeviceId?: string
  bystanderIp?: string
  bystanderUserAgent?: string
  latitude: number
  longitude: number
  locationAccuracy?: number
  declarationAccepted: boolean
  bystanderOtpVerified: boolean
}) {
  if (!input.bystanderOtpVerified) {
    throw new AppError('Mobile number must be OTP-verified before reporting an emergency', 403)
  }

  // Resolve vehicle
  let vehicleId = input.vehicleId
  let ownerId: string

  if (input.qrCodeId) {
    const qr = await prisma.qrCode.findUnique({
      where: { id: input.qrCodeId, isActive: true },
      include: { vehicle: true },
    })
    if (!qr) throw new AppError('QR code not found', 404)
    vehicleId = qr.vehicleId
    ownerId = qr.vehicle.userId
  } else if (vehicleId) {
    const v = await prisma.vehicle.findUnique({ where: { id: vehicleId } })
    if (!v) throw new AppError('Vehicle not found', 404)
    ownerId = v.userId
  } else {
    throw new AppError('vehicleId or qrCodeId required', 400)
  }

  const incidentId = await generateIncidentId()
  const shareToken = generateShareToken()

  const abuse = await checkBystanderAbuse(input.bystanderPhone, input.bystanderIp, vehicleId ?? null)

  const event = await prisma.emergencyEvent.create({
    data: {
      incidentId,
      shareToken,
      qrCodeId: input.qrCodeId ?? null,
      vehicleId: vehicleId ?? null,
      accessMethod: input.accessMethod,
      status: 'PENDING',
      bystanderName: input.bystanderName,
      bystanderPhone: input.bystanderPhone,
      bystanderDeviceId: input.bystanderDeviceId,
      bystanderIp: input.bystanderIp,
      bystanderUserAgent: input.bystanderUserAgent,
      latitude: input.latitude,
      longitude: input.longitude,
      locationAccuracy: input.locationAccuracy,
      lastLatitude: input.latitude,
      lastLongitude: input.longitude,
      lastLocationAt: new Date(),
      declarationAccepted: !!input.declarationAccepted,
      declarationAcceptedAt: input.declarationAccepted ? new Date() : null,
      bystanderOtpVerified: true,
      bystanderOtpVerifiedAt: new Date(),
      flaggedForAbuseReview: abuse.flagged,
      abuseReviewReason: abuse.reason,
    },
  })

  const bystanderDesc = `${input.bystanderName || 'Bystander'} (${input.bystanderPhone}, OTP-verified)`

  await addTimelineEntry(
    event.id,
    'ACCIDENT_REPORTED',
    `Accident reported via ${input.accessMethod === 'QR_SCAN' ? 'QR scan' : 'vehicle number search'} by ${bystanderDesc}`,
    { lat: input.latitude, lng: input.longitude, incidentId, accessMethod: input.accessMethod }
  )

  await auditLog(
    null,
    'BYSTANDER_AUTHENTICATED',
    'EmergencyEvent',
    event.id,
    input.bystanderIp,
    {
      bystanderPhone: input.bystanderPhone,
      bystanderDeviceId: input.bystanderDeviceId,
      bystanderUserAgent: input.bystanderUserAgent,
      flaggedForAbuseReview: abuse.flagged,
      abuseReviewReason: abuse.reason,
    }
  )
  if (abuse.flagged) {
    logger.warn('Bystander flagged for possible QR misuse', { eventId: event.id, phone: input.bystanderPhone, reason: abuse.reason })
  }

  // Notify owner immediately (parallel, non-blocking)
  notifyOwnerOfScan(ownerId, event.id, incidentId, input.latitude, input.longitude)
    .catch(err => logger.error('Owner notify failed', { err }))

  // AUTH COMPLETE ⇒ activate the full emergency response right now.
  // No waiting on photos or AI photo-verification — OTP + GPS + physical
  // presence declaration IS the verification for speed. Runs in the
  // background so the API responds instantly and the bystander's screen can
  // move straight to revealing emergency contacts / medical info / hospitals.
  activateEmergency(event.id).catch(err =>
    logger.error('Emergency activation failed', { eventId: event.id, err })
  )

  logger.info('Emergency event created', { eventId: event.id, incidentId, accessMethod: input.accessMethod })
  return { ...event, vehicleId }
}

// ─────────────────────────────────────────────────────────────────
// OPTIONAL: extra photo evidence
// Photos are no longer required to authenticate a report (mobile+OTP+GPS
// does that now) or to reveal emergency info. A bystander MAY still attach
// photos afterwards for police/insurance records — this never blocks or
// delays the emergency response, which has already been activated.
// ─────────────────────────────────────────────────────────────────
export async function uploadEvidence(
  eventId: string,
  files: {
    accidentPhoto?: Express.Multer.File
    selfie?: Express.Multer.File
    additionalPhotos?: Express.Multer.File[]
  }
) {
  const event = await prisma.emergencyEvent.findUnique({ where: { id: eventId } })
  if (!event) throw new AppError('Event not found', 404)
  if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(event.status)) {
    throw new AppError('Cannot upload evidence for a closed event', 400)
  }

  const updates: Record<string, any> = {}

  if (files.accidentPhoto) {
    updates.accidentPhotoUrl = await uploadToS3(
      files.accidentPhoto.buffer,
      `emergency/${eventId}/accident-${Date.now()}.jpg`,
      files.accidentPhoto.mimetype
    )
  }

  if (files.selfie) {
    updates.bystanderSelfieUrl = await uploadToS3(
      files.selfie.buffer,
      `emergency/${eventId}/selfie-${Date.now()}.jpg`,
      files.selfie.mimetype
    )
  }

  const additionalUrls: string[] = []
  for (const photo of files.additionalPhotos ?? []) {
    const url = await uploadToS3(
      photo.buffer,
      `emergency/${eventId}/extra-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`,
      photo.mimetype
    )
    additionalUrls.push(url)
  }
  if (additionalUrls.length) updates.additionalPhotoUrls = additionalUrls

  if (Object.keys(updates).length) {
    await prisma.emergencyEvent.update({ where: { id: eventId }, data: updates })
    await addTimelineEntry(eventId, 'EVIDENCE_UPLOADED', 'Additional photo evidence attached for records')
  }

  if (updates.accidentPhotoUrl) {
    refineSeverityFromPhoto(eventId).catch(err => logger.error('Severity refinement failed', { eventId, err }))
  }

  return { success: true }
}

// ─────────────────────────────────────────────────────────────────
// STEP 4: ACTIVATE — the core "quick reveal" step.
// Fires immediately once OTP authentication succeeds. In parallel:
//   - notify all emergency contacts (SMS/WhatsApp/Email) with full details
//   - find nearby quality hospitals
//   - set a safety-first default severity (HIGH) so guidance shows instantly
// If a photo is attached later, severity is silently refined in the
// background — but nothing here waits on that.
// ─────────────────────────────────────────────────────────────────
async function activateEmergency(eventId: string) {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: {
      qrCode: {
        include: {
          vehicle: {
            include: {
              user: {
                include: {
                  profile: {
                    include: {
                      emergencyContacts: {
                        where: { isActive: true },
                        orderBy: { priority: 'asc' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      // Also include direct vehicle relation (for plate-search events)
      vehicle: {
        include: {
          user: {
            include: {
              profile: {
                include: {
                  emergencyContacts: {
                    where: { isActive: true },
                    orderBy: { priority: 'asc' },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (!event) return

  // Resolve vehicle and profile from either QR path or direct vehicle path
  let vehicleNumber = 'Unknown'
  let profile: any = null

  if (event.qrCode?.vehicle) {
    vehicleNumber = event.qrCode.vehicle.vehicleNumber
    profile = event.qrCode.vehicle.user.profile
  } else if (event.vehicle) {
    vehicleNumber = event.vehicle.vehicleNumber
    profile = event.vehicle.user.profile
  }

  if (!profile) {
    logger.warn('No profile found for emergency response', { eventId })
    return
  }

  // Safety-first instant defaults — set BEFORE the parallel work below so the
  // bystander's screen and the family's SMS both reflect an active emergency
  // the moment authentication succeeds, with zero wait on AI or photos.
  await prisma.emergencyEvent.update({
    where: { id: eventId },
    data: {
      status: 'ACTIVE',
      aiVerdict: 'ACCIDENT',
      aiVerdictScore: 1,
      aiVerdictReason: 'Bystander authenticated via mobile OTP + live GPS at the scene',
      aiSeverity: event.aiSeverity ?? 'HIGH',
      aiSeverityReason: event.aiSeverityReason ?? 'Defaulted to HIGH for immediate response — treat as serious until confirmed otherwise',
    },
  })
  await addTimelineEntry(eventId, 'EMERGENCY_ACTIVE', 'Emergency activated instantly on bystander authentication — notifying family and locating hospitals')

  await Promise.allSettled([
    notifyEmergencyContacts(event, profile, vehicleNumber),
    recommendHospital(eventId, event, profile),
  ])
}

// ─────────────────────────────────────────────────────────────────
// Notify family — COMPLETE message with all required fields
// ─────────────────────────────────────────────────────────────────
async function notifyEmergencyContacts(event: any, profile: any, vehicleNumber: string) {
  const contacts = profile.emergencyContacts
  if (!contacts?.length) {
    logger.warn('No emergency contacts found', { eventId: event.id })
    return
  }

  const mapLink = `https://maps.google.com/maps?q=${event.latitude},${event.longitude}`
  const navLink = `https://maps.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}&travelmode=driving`
  const trackingUrl = `${process.env.APP_URL}/track/${event.shareToken}`
  const incidentTime = new Date(event.createdAt).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  const bystanderInfo = event.bystanderName
    ? `Reported by: ${event.bystanderName}${event.bystanderPhone ? ` | ${event.bystanderPhone}` : ''}`
    : 'Reported by: Anonymous bystander'

  const smsMessage =
    `🚨 EMERGENCY ALERT — RoadSafe\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `Victim: ${profile.fullName}\n` +
    `Vehicle: ${vehicleNumber}\n` +
    `${bystanderInfo}\n` +
    `Time: ${incidentTime}\n` +
    `Incident ID: ${event.incidentId}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `📍 Location: ${mapLink}\n` +
    `🧭 Navigate: ${navLink}\n` +
    `📡 Live Track: ${trackingUrl}\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `⚡ Please call 112 immediately or contact the bystander.`

  await notifyContacts(
    event.id,
    contacts,
    smsMessage,
    profile.fullName,
    vehicleNumber,
    event.bystanderName,
    event.bystanderPhone,
    event.incidentId,
    trackingUrl,
    { id: event.id, latitude: event.latitude, longitude: event.longitude }
  )

  await prisma.emergencyEvent.update({ where: { id: event.id }, data: { ownerAlerted: true } })
  await addTimelineEntry(
    event.id,
    'FAMILY_NOTIFIED',
    `${contacts.length} emergency contact(s) notified via SMS, WhatsApp, and Email — Incident ID: ${event.incidentId}`
  )
}

// ─────────────────────────────────────────────────────────────────
// Distance helper (Haversine, km) — used for hospital ranking with no
// dependency on any external AI/maps service, so it never adds latency.
// ─────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// A rough "quality" score to prefer well-equipped hospitals among nearby
// options — trauma centre / ICU / blood bank / rating, not just distance.
function hospitalQualityScore(h: { hasTraumaCenter: boolean; hasICU: boolean; hasBloodBank: boolean; rating: number | null }): number {
  return (h.hasTraumaCenter ? 3 : 0) + (h.hasICU ? 2 : 0) + (h.hasBloodBank ? 1 : 0) + (h.rating ?? 3) / 2
}

/**
 * Returns the top N nearby hospitals for a given location, ranked by a
 * blend of distance and quality (trauma centre / ICU / blood bank / rating).
 * Pure DB + math — no external API dependency, so it's always fast.
 */
export async function getNearbyHospitals(latitude: number, longitude: number, limit = 5) {
  const hospitals = await prisma.hospital.findMany({ where: { isActive: true } })
  if (!hospitals.length) return []

  const AVG_SPEED_KMH = 30 // rough city-traffic estimate for ETA

  return hospitals
    .map(h => {
      const distanceKm = haversineKm(latitude, longitude, h.latitude, h.longitude)
      return {
        id: h.id,
        name: h.name,
        address: h.address,
        city: h.city,
        phone: h.phone,
        emergencyPhone: h.emergencyPhone,
        latitude: h.latitude,
        longitude: h.longitude,
        hasTraumaCenter: h.hasTraumaCenter,
        hasICU: h.hasICU,
        hasBloodBank: h.hasBloodBank,
        hasNeurology: h.hasNeurology,
        rating: h.rating,
        distanceKm: Math.round(distanceKm * 10) / 10,
        etaMinutes: Math.max(3, Math.round((distanceKm / AVG_SPEED_KMH) * 60)),
        navigationUrl: `https://maps.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${h.latitude},${h.longitude}&travelmode=driving`,
        // Combined rank: closer AND better-equipped wins. Distance dominates
        // beyond ~15km; quality breaks ties between comparably-close options.
        _rank: distanceKm - hospitalQualityScore(h),
      }
    })
    .sort((a, b) => a._rank - b._rank)
    .slice(0, limit)
    .map(({ _rank, ...h }) => h)
}

// ─────────────────────────────────────────────────────────────────
// Hospital Recommendation — picks the single best hospital (nearest +
// best-equipped), stores it on the event for the primary "Nearest Hospital"
// card, pre-alerts that hospital's ER, and fires an SMS pre-alert.
// ─────────────────────────────────────────────────────────────────
async function recommendHospital(eventId: string, event: any, profile: any) {
  try {
    const nearby = await getNearbyHospitals(event.latitude, event.longitude, 5)
    if (!nearby.length) {
      logger.warn('No hospitals in database for recommendation', { eventId })
      return
    }

    const best = nearby[0]

    await prisma.emergencyEvent.update({
      where: { id: eventId },
      data: {
        recommendedHospitalId: best.id,
        hospitalEtaMinutes: best.etaMinutes,
        hospitalRouteUrl: best.navigationUrl,
      },
    })

    await addTimelineEntry(
      eventId,
      'HOSPITAL_RECOMMENDED',
      `Best hospital: ${best.name} — ${best.distanceKm}km away, ETA ~${best.etaMinutes} min`,
      { nearbyHospitals: nearby.map(h => ({ id: h.id, name: h.name, distanceKm: h.distanceKm })) }
    )

    sendHospitalPreAlert(
      best.id,
      eventId,
      {
        fullName: profile.fullName,
        bloodGroup: profile.bloodGroup,
        allergies: profile.allergies || [],
        chronicConditions: profile.chronicConditions || [],
        currentMedications: profile.currentMedications || [],
        organDonor: profile.organDonor,
        medicalNotes: profile.medicalNotes,
      },
      best.etaMinutes,
      event.latitude,
      event.longitude
    ).catch(err => logger.error('Hospital pre-alert failed', { err }))
  } catch (err) {
    logger.error('Hospital recommendation failed', { eventId, err })
  }
}

// ─────────────────────────────────────────────────────────────────
// OPTIONAL background refinement — only runs if a photo is later attached
// via uploadEvidence. Never blocks the initial reveal/notification, which
// has already happened by the time this could possibly run.
// ─────────────────────────────────────────────────────────────────
export async function refineSeverityFromPhoto(eventId: string) {
  const event = await prisma.emergencyEvent.findUnique({ where: { id: eventId } })
  if (!event?.accidentPhotoUrl) return

  try {
    const result = await callAiService('/ai/severity', {
      verdict: event.aiVerdict,
      confidence: event.aiVerdictScore,
      accident_photo_url: event.accidentPhotoUrl,
    })

    await prisma.emergencyEvent.update({
      where: { id: eventId },
      data: {
        aiSeverity: result.severity,
        aiSeverityScore: result.confidence,
        aiSeverityReason: result.explanation,
        aiRecommendedActions: result.recommended_actions ?? [],
      },
    })

    await addTimelineEntry(
      eventId,
      'SEVERITY_ASSESSED',
      `Severity refined from photo: ${result.severity} — ${result.explanation}`,
      { severity: result.severity, actions: result.recommended_actions }
    )
  } catch (err) {
    logger.warn('Photo-based severity refinement unavailable, keeping HIGH default', { eventId, err })
  }
}

// ─────────────────────────────────────────────────────────────────
// Update live location
// ─────────────────────────────────────────────────────────────────
export async function updateLocation(eventId: string, lat: number, lng: number, accuracy?: number, source = 'bystander') {
  const event = await prisma.emergencyEvent.findUnique({ where: { id: eventId }, select: { id: true, status: true } })
  if (!event) throw new AppError('Event not found', 404)
  if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(event.status)) return

  await Promise.all([
    prisma.emergencyEvent.update({
      where: { id: eventId },
      data: { lastLatitude: lat, lastLongitude: lng, lastLocationAt: new Date() },
    }),
    prisma.locationUpdate.create({
      data: { emergencyEventId: eventId, latitude: lat, longitude: lng, accuracy, source },
    }),
  ])
}

// ─────────────────────────────────────────────────────────────────
// "I'm OK" — owner confirms safe
// ─────────────────────────────────────────────────────────────────
export async function ownerAcknowledgeOk(eventId: string, ownerId: string) {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: {
      qrCode: { include: { vehicle: { select: { userId: true, vehicleNumber: true } } } },
      vehicle: { select: { userId: true, vehicleNumber: true } },
    },
  })

  if (!event) throw new AppError('Event not found', 404)

  // Auth: only the vehicle owner can call this
  const vehicleOwnerId = event.qrCode?.vehicle?.userId ?? event.vehicle?.userId
  if (!vehicleOwnerId || vehicleOwnerId !== ownerId) throw new AppError('Unauthorized', 403)

  if (['FALSE_ALARM', 'RESOLVED', 'CANCELLED'].includes(event.status)) {
    throw new AppError('Event is already closed', 400)
  }

  await prisma.emergencyEvent.update({
    where: { id: eventId },
    data: {
      ownerAckedOk: true,
      ownerAckedAt: new Date(),
      status: 'RESOLVED',
      resolvedAt: new Date(),
      resolutionNote: 'Vehicle owner confirmed safe via app',
    },
  })

  await addTimelineEntry(eventId, 'OWNER_CONFIRMED_OK', 'Vehicle owner confirmed they are safe. Emergency cancelled.')

  // Notify all contacts that owner is safe
  const fullEvent = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: {
      qrCode: {
        include: {
          vehicle: {
            include: {
              user: {
                include: { profile: { include: { emergencyContacts: { where: { isActive: true } } } } },
              },
            },
          },
        },
      },
    },
  })

  const profile = fullEvent?.qrCode?.vehicle?.user?.profile
  const vehicleNumber = fullEvent?.qrCode?.vehicle?.vehicleNumber ?? ''

  if (profile?.emergencyContacts?.length) {
    const safeMsg =
      `✅ SAFE — RoadSafe Update\n` +
      `${profile.fullName} has confirmed they are SAFE.\n` +
      `Incident ${event.incidentId} is now CLOSED.\n` +
      `No further action needed. Thank you.`

    notifyContacts(eventId, profile.emergencyContacts, safeMsg, profile.fullName, vehicleNumber)
      .catch(err => logger.error('Safe notification failed', { err }))
  }
}

// ─────────────────────────────────────────────────────────────────
// Get event by share token (family tracking — public)
// ─────────────────────────────────────────────────────────────────
export async function getEventByShareToken(shareToken: string) {
  const event = await prisma.emergencyEvent.findUnique({
    where: { shareToken },
    include: {
      qrCode: {
        include: {
          vehicle: {
            select: {
              vehicleNumber: true, vehicleType: true, make: true, model: true, color: true,
              user: { include: { profile: { select: { fullName: true } } } },
            },
          },
        },
      },
      vehicle: {
        select: {
          vehicleNumber: true, vehicleType: true, make: true, model: true, color: true,
          user: { include: { profile: { select: { fullName: true } } } },
        },
      },
      timeline: { orderBy: { createdAt: 'asc' } },
      hospital: {
        select: {
          name: true, address: true, city: true, phone: true, emergencyPhone: true,
          latitude: true, longitude: true, hasTraumaCenter: true, hasICU: true, hasBloodBank: true,
        },
      },
      notifications: {
        select: { contactName: true, channel: true, status: true, sentAt: true },
        orderBy: { createdAt: 'asc' },
      },
      locationUpdates: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })

  if (!event) throw new AppError('Event not found or link expired', 404)

  // Resolve vehicle + victim from either QR path or direct vehicle path
  const resolvedVehicle = event.qrCode?.vehicle ?? event.vehicle
  const victimProfile = resolvedVehicle?.user?.profile

  return {
    id: event.id,
    incidentId: event.incidentId,
    status: event.status,
    accessMethod: event.accessMethod,
    // Victim info (safe to share with family)
    victimName: victimProfile?.fullName ?? 'Unknown',
    vehicleNumber: resolvedVehicle?.vehicleNumber ?? 'Unknown',
    vehicleType: resolvedVehicle?.vehicleType,
    vehicleColor: resolvedVehicle?.color,
    vehicleMake: resolvedVehicle?.make,
    vehicleModel: resolvedVehicle?.model,
    // AI
    aiVerdict: event.aiVerdict,
    aiVerdictScore: event.aiVerdictScore,
    aiSeverity: event.aiSeverity,
    aiSeverityReason: event.aiSeverityReason,
    aiRecommendedActions: event.aiRecommendedActions,
    // Location (live if available)
    latitude: event.lastLatitude ?? event.latitude,
    longitude: event.lastLongitude ?? event.longitude,
    locationUpdatedAt: event.lastLocationAt ?? event.createdAt,
    // Hospital
    hospital: event.hospital,
    hospitalEtaMinutes: event.hospitalEtaMinutes,
    hospitalRouteUrl: event.hospitalRouteUrl,
    // Bystander
    bystanderName: event.bystanderName,
    bystanderPhone: event.bystanderPhone,
    // Timeline
    timeline: event.timeline,
    notifications: event.notifications,
    // Meta
    createdAt: event.createdAt,
    resolvedAt: event.resolvedAt,
    ownerAckedOk: event.ownerAckedOk,
  }
}

// ─────────────────────────────────────────────────────────────────
// Get event status (internal + owner)
// ─────────────────────────────────────────────────────────────────
export async function getEventStatus(eventId: string) {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: {
      timeline: { orderBy: { createdAt: 'asc' } },
      hospital: {
        select: {
          name: true, address: true, phone: true, emergencyPhone: true,
          latitude: true, longitude: true, hasTraumaCenter: true,
          hasICU: true, hasBloodBank: true,
        },
      },
      notifications: {
        select: { contactName: true, channel: true, status: true, sentAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!event) throw new AppError('Event not found', 404)
  return event
}

// ─────────────────────────────────────────────────────────────────
// Medical passport — public after verification
// ─────────────────────────────────────────────────────────────────
export async function getMedicalPassport(eventIdOrToken: string, accessorIp?: string, useToken = false) {
  const where = useToken ? { shareToken: eventIdOrToken } : { id: eventIdOrToken }

  const event = await prisma.emergencyEvent.findUnique({
    where,
    include: {
      qrCode: {
        include: { vehicle: { include: { user: { include: { profile: true } } } } },
      },
      vehicle: {
        include: { user: { include: { profile: true } } },
      },
    },
  })

  if (!event) throw new AppError('Event not found', 404)

  // Gate on bystander OTP authentication rather than a downstream AI status —
  // OTP + GPS + declaration IS the verification now, so this is available the
  // instant those checks pass, with no race against the async activation job.
  const closedButUnauthenticated = !event.bystanderOtpVerified && !useToken
  if (closedButUnauthenticated) {
    throw new AppError('Medical passport is only available after the bystander is OTP-verified', 403)
  }

  // Resolve profile from either path
  const profile =
    event.qrCode?.vehicle?.user?.profile ??
    event.vehicle?.user?.profile

  if (!profile) throw new AppError('Medical profile not found for this vehicle owner', 404)

  await auditLog(null, 'MEDICAL_PASSPORT_ACCESSED', 'EmergencyEvent', event.id, accessorIp)
  await addTimelineEntry(event.id, 'MEDICAL_ACCESSED', 'Medical passport accessed by emergency responder')

  return {
    incidentId: event.incidentId,
    fullName: profile.fullName,
    bloodGroup: profile.bloodGroup ?? 'Unknown',
    allergies: profile.allergies,
    chronicConditions: profile.chronicConditions,
    currentMedications: profile.currentMedications,
    organDonor: profile.organDonor,
    medicalNotes: profile.medicalNotes,
    accessedAt: new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────
// COMBINED QUICK REVEAL — the core of the new flow.
// One call, right after OTP auth succeeds, returns everything a bystander
// needs in a single shot: medical passport, emergency contact numbers
// (so they can call the family directly), and nearby quality hospitals.
// Family notification (SMS/WhatsApp/Email) has already been fired off
// in parallel by activateEmergency — this endpoint just reads back state.
// ─────────────────────────────────────────────────────────────────
export async function getEmergencyReveal(eventId: string, accessorIp?: string) {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: {
      qrCode: {
        include: {
          vehicle: {
            include: {
              user: {
                include: {
                  profile: { include: { emergencyContacts: { where: { isActive: true }, orderBy: { priority: 'asc' } } } },
                },
              },
            },
          },
        },
      },
      vehicle: {
        include: {
          user: {
            include: {
              profile: { include: { emergencyContacts: { where: { isActive: true }, orderBy: { priority: 'asc' } } } },
            },
          },
        },
      },
    },
  })

  if (!event) throw new AppError('Event not found', 404)
  if (!event.bystanderOtpVerified) {
    throw new AppError('Verify your mobile number via OTP before emergency info can be revealed', 403)
  }

  const profile = event.qrCode?.vehicle?.user?.profile ?? event.vehicle?.user?.profile
  const vehicle = event.qrCode?.vehicle ?? event.vehicle
  if (!profile) throw new AppError('No profile found for this vehicle owner', 404)

  await auditLog(null, 'EMERGENCY_INFO_REVEALED', 'EmergencyEvent', event.id, accessorIp)
  await addTimelineEntry(event.id, 'INFO_REVEALED', 'Emergency contacts, medical info, and nearby hospitals revealed to bystander')

  const nearbyHospitals = await getNearbyHospitals(
    event.lastLatitude ?? event.latitude,
    event.lastLongitude ?? event.longitude,
    5
  )

  return {
    incidentId: event.incidentId,
    status: event.status,
    victimName: profile.fullName,
    vehicleNumber: vehicle?.vehicleNumber ?? 'Unknown',

    // Medical passport — shown immediately, no extra click
    medical: {
      bloodGroup: profile.bloodGroup ?? 'Unknown',
      allergies: profile.allergies,
      chronicConditions: profile.chronicConditions,
      currentMedications: profile.currentMedications,
      organDonor: profile.organDonor,
      medicalNotes: profile.medicalNotes,
    },

    // Emergency contact numbers — bystander can call the family directly
    emergencyContacts: profile.emergencyContacts.map(c => ({
      name: c.name,
      relationship: c.relationship,
      phone: c.phone,
      priority: c.priority,
    })),

    // Nearby well-equipped hospitals
    nearbyHospitals,

    // What's already been done automatically
    familyNotified: event.ownerAlerted,
    trackingUrl: `${process.env.APP_URL}/track/${event.shareToken}`,
  }
}

// ─────────────────────────────────────────────────────────────────
// Owner notify of scan helper
// ─────────────────────────────────────────────────────────────────
async function notifyOwnerOfScan(userId: string, eventId: string, incidentId: string, lat: number, lng: number) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, profile: { select: { fullName: true } } },
    })
    if (!user?.phone) return

    const mapLink = `https://maps.google.com/?q=${lat},${lng}`
    const message =
      `🚨 RoadSafe: Your vehicle QR was just scanned.\n` +
      `Incident: ${incidentId}\n` +
      `📍 Near: ${mapLink}\n` +
      `If you are SAFE, open the RoadSafe app and tap "I'm OK" to cancel.\n` +
      `If this is real, help is being dispatched. Call 112 now.`

    const { sendSms } = await import('../../utils/sms')
    await sendSms(user.phone, message)
    logger.info('Owner notified of QR scan', { userId, eventId, incidentId })
  } catch (err) {
    logger.error('Owner notify failed', { userId, eventId, err })
  }
}
