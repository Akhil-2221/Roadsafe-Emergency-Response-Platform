import { Router, Request, Response } from 'express'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import * as emergencyService from './emergency.service'
import { sendBystanderOtp, verifyBystanderOtp } from './bystanderOtp.service'
import { authenticate } from '../../middleware/authenticate'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import { prisma } from '../../config/database'
import { env } from '../../config/env'

const router = Router()

// Memory storage — files go directly to S3 from buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Only image files allowed', 400) as any, false)
    }
    cb(null, true)
  },
})

// Rate limiters
const scanLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 10, standardHeaders: true })
const searchLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 20, standardHeaders: true })

// ═══════════════════════════════════════════════════════
// PUBLIC ROUTES — No auth required (bystander flow)
// ═══════════════════════════════════════════════════════

// POST /api/emergency/scan/:qrToken
// Step 1A: QR code scanned by bystander
router.post('/scan/:qrToken', scanLimiter, asyncHandler(async (req: Request, res: Response) => {
  const result = await emergencyService.handleQrScan(req.params.qrToken, req.ip)
  res.json({
    success: true,
    message: 'QR verified. Proceed to capture evidence.',
    data: result,
  })
}))

// POST /api/emergency/lookup
// Step 1B: Alternative — find vehicle by plate or mobile number (when QR damaged/missing)
router.post('/lookup', searchLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { vehicleNumber, mobile } = req.body

  if (!vehicleNumber && !mobile) {
    throw new AppError('vehicleNumber or mobile is required', 400)
  }

  const result = await emergencyService.findVehicleByPlateOrMobile({
    vehicleNumber: vehicleNumber?.trim(),
    mobile: mobile?.trim(),
    accessorIp: req.ip,
  })

  res.json({
    success: true,
    message: 'Vehicle found. Proceed to report emergency.',
    data: result,
  })
}))

// GET /api/emergency/config
// Tells the frontend whether bystander OTP verification is required —
// lets the emergency page skip the OTP step entirely when disabled.
router.get('/config', (req: Request, res: Response) => {
  res.json({ success: true, data: { requireBystanderOtp: env.REQUIRE_BYSTANDER_OTP } })
})

// POST /api/emergency/otp/send
// Step 1.5 (optional, gated by REQUIRE_BYSTANDER_OTP): verify bystander is a real person
router.post('/otp/send', scanLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body
  if (!phone) throw new AppError('phone is required', 400)

  const { expiresAt } = await sendBystanderOtp(phone)
  res.json({ success: true, message: 'OTP sent to your mobile number', data: { expiresAt } })
}))

// POST /api/emergency/otp/verify
router.post('/otp/verify', scanLimiter, asyncHandler(async (req: Request, res: Response) => {
  const { phone, code } = req.body
  if (!phone || !code) throw new AppError('phone and code are required', 400)

  await verifyBystanderOtp(phone, code)
  res.json({ success: true, message: 'Phone verified' })
}))

// POST /api/emergency/start
// Step 2: Create emergency event. Authentication is bystander mobile + OTP +
// live GPS — this IS the verification now (no photo/selfie required). As
// soon as this succeeds, family notification + hospital lookup are triggered
// in the background and GET /:eventId/reveal can be called immediately.
router.post('/start', asyncHandler(async (req: Request, res: Response) => {
  const {
    vehicleId, qrCodeId, accessMethod,
    bystanderName, bystanderPhone,
    latitude, longitude, locationAccuracy,
    declarationAccepted, bystanderOtpVerified,
  } = req.body

  if (!latitude || !longitude) throw new AppError('latitude and longitude are required. Please allow location access.', 400)
  if (!vehicleId && !qrCodeId) throw new AppError('vehicleId or qrCodeId required', 400)
  if (!declarationAccepted) {
    throw new AppError('You must confirm you are physically present at the accident scene', 400)
  }
  if (!bystanderPhone) throw new AppError('Your mobile number is required to report an emergency', 400)
  if (!bystanderOtpVerified) throw new AppError('Please verify your mobile number with the OTP first', 400)

  const event = await emergencyService.createEmergencyEvent({
    vehicleId,
    qrCodeId,
    accessMethod: accessMethod || 'QR_SCAN',
    bystanderName,
    bystanderPhone,
    bystanderDeviceId: req.headers['x-device-id'] as string,
    bystanderIp: req.ip,
    bystanderUserAgent: req.get('user-agent'),
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    locationAccuracy: locationAccuracy ? parseFloat(locationAccuracy) : undefined,
    declarationAccepted: true,
    bystanderOtpVerified: true,
  })

  res.status(201).json({
    success: true,
    message: 'Emergency activated. Family is being notified now.',
    data: {
      eventId: event.id,
      incidentId: event.incidentId,
      shareToken: event.shareToken,
      trackingUrl: `${process.env.APP_URL}/track/${event.shareToken}`,
    },
  })
}))

// GET /api/emergency/:eventId/reveal
// Step 3: THE quick reveal — medical passport + emergency contact numbers +
// nearby quality hospitals, all in one call. Available immediately once the
// bystander is OTP-verified (checked inside the service function).
router.get('/:eventId/reveal', asyncHandler(async (req: Request, res: Response) => {
  const data = await emergencyService.getEmergencyReveal(req.params.eventId, req.ip)
  res.json({ success: true, data })
}))

// POST /api/emergency/:eventId/evidence
// OPTIONAL: attach accident photos afterwards for police/insurance records.
// Never blocks or gates the reveal above — that already happened on OTP auth.
router.post(
  '/:eventId/evidence',
  upload.fields([
    { name: 'accidentPhoto', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
    { name: 'additionalPhotos', maxCount: 3 },
  ]),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] }

    await emergencyService.uploadEvidence(req.params.eventId, {
      accidentPhoto: files?.accidentPhoto?.[0],
      selfie: files?.selfie?.[0],
      additionalPhotos: files?.additionalPhotos,
    })

    res.json({
      success: true,
      message: 'Evidence attached to incident record.',
    })
  })
)

// POST /api/emergency/:eventId/location
// Live location update from bystander (called every ~30s)
router.post('/:eventId/location', asyncHandler(async (req: Request, res: Response) => {
  const { latitude, longitude, accuracy } = req.body
  if (!latitude || !longitude) throw new AppError('latitude and longitude required', 400)

  await emergencyService.updateLocation(
    req.params.eventId,
    parseFloat(latitude),
    parseFloat(longitude),
    accuracy ? parseFloat(accuracy) : undefined,
    'bystander'
  )

  res.json({ success: true })
}))

// GET /api/emergency/:eventId/status
// Polling endpoint — bystander polls this
router.get('/:eventId/status', asyncHandler(async (req: Request, res: Response) => {
  const event = await emergencyService.getEventStatus(req.params.eventId)
  res.json({ success: true, data: event })
}))

// GET /api/emergency/:eventId/status/stream
// SSE — real-time updates (preferred over polling)
router.get('/:eventId/status/stream', (req: Request, res: Response) => {
  const { eventId } = req.params

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
  res.flushHeaders()

  const send = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  // Send initial state
  emergencyService.getEventStatus(eventId)
    .then(event => send({ type: 'status', data: event }))
    .catch(() => send({ type: 'error', message: 'Event not found' }))

  // Poll DB every 3s and push changes via SSE
  const interval = setInterval(async () => {
    try {
      const event = await emergencyService.getEventStatus(eventId)
      send({ type: 'status', data: event })

      // Stop stream if event is terminal
      if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(event.status)) {
        clearInterval(interval)
        res.end()
      }
    } catch {
      clearInterval(interval)
      res.end()
    }
  }, 3000)

  // Heartbeat every 20s
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n')
  }, 20000)

  req.on('close', () => {
    clearInterval(interval)
    clearInterval(heartbeat)
  })
})

// GET /api/emergency/:eventId/medical
// Reveal medical passport — only after AI verification
router.get('/:eventId/medical', asyncHandler(async (req: Request, res: Response) => {
  const passport = await emergencyService.getMedicalPassport(req.params.eventId, req.ip)
  res.json({ success: true, data: passport })
}))

// GET /api/emergency/:eventId/hospital
// Recommended hospital with directions
router.get('/:eventId/hospital', asyncHandler(async (req: Request, res: Response) => {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: req.params.eventId },
    include: {
      hospital: {
        select: {
          name: true, address: true, city: true, phone: true, emergencyPhone: true,
          latitude: true, longitude: true, hasTraumaCenter: true,
          hasBloodBank: true, hasICU: true, hasNeurology: true,
        },
      },
    },
  })
  if (!event) throw new AppError('Event not found', 404)

  res.json({
    success: true,
    data: {
      hospital: event.hospital,
      etaMinutes: event.hospitalEtaMinutes,
      routeUrl: event.hospitalRouteUrl,
    },
  })
}))

// GET /api/emergency/:eventId/timeline
router.get('/:eventId/timeline', asyncHandler(async (req: Request, res: Response) => {
  const entries = await prisma.timelineEntry.findMany({
    where: { emergencyEventId: req.params.eventId },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ success: true, data: { timeline: entries } })
}))

// GET /api/emergency/track/:shareToken
// Family tracking page data — public, secured by shareToken
router.get('/track/:shareToken', asyncHandler(async (req: Request, res: Response) => {
  const data = await emergencyService.getEventByShareToken(req.params.shareToken)
  res.json({ success: true, data })
}))

// GET /api/emergency/track/:shareToken/medical
// Medical passport via share token
router.get('/track/:shareToken/medical', asyncHandler(async (req: Request, res: Response) => {
  const passport = await emergencyService.getMedicalPassport(req.params.shareToken, req.ip, true)
  res.json({ success: true, data: passport })
}))

// ═══════════════════════════════════════════════════════
// OWNER ROUTES — Authenticated
// ═══════════════════════════════════════════════════════

// POST /api/emergency/:eventId/ok — owner confirms safe
router.post('/:eventId/ok', authenticate, asyncHandler(async (req: Request, res: Response) => {
  await emergencyService.ownerAcknowledgeOk(req.params.eventId, req.user!.id)
  res.json({ success: true, message: 'Confirmed safe. All contacts notified.' })
}))

// GET /api/emergency/my/events — owner's history
router.get('/my/events', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const events = await prisma.emergencyEvent.findMany({
    where: {
      qrCode: { vehicle: { userId: req.user!.id } },
    },
    include: {
      timeline: { orderBy: { createdAt: 'asc' }, take: 3 },
      hospital: { select: { name: true, address: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  res.json({ success: true, data: { events } })
}))

export default router
