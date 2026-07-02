import { prisma } from '../config/database'
import { logger } from '../config/logger'
import { sendSms, sendWhatsApp } from './sms'
import { sendEmail } from './email'

interface Contact {
  id: string
  name: string
  phone: string
  email?: string | null
}

interface EventSnapshot {
  id: string
  latitude: number
  longitude: number
}

/**
 * Send emergency notifications to all contacts.
 * Message includes ALL required fields per spec:
 * victim name, vehicle number, bystander name/phone,
 * GPS, nav link, incident ID, tracking URL, timestamp.
 */
export async function notifyContacts(
  emergencyEventId: string,
  contacts: Contact[],
  smsMessage: string,
  victimName: string,
  vehicleNumber: string,
  bystanderName?: string | null,
  bystanderPhone?: string | null,
  incidentId?: string,
  trackingUrl?: string,
  eventSnapshot?: EventSnapshot
) {
    console.log("=================================");
console.log("🚨 notifyContacts() called");
console.log("Contacts:", contacts.length);
console.log("Victim:", victimName);
console.log("=================================");
  const mapLink = eventSnapshot
    ? `https://maps.google.com/?q=${eventSnapshot.latitude},${eventSnapshot.longitude}`
    : null

  const navLink = eventSnapshot
    ? `https://maps.google.com/maps/dir/?api=1&destination=${eventSnapshot.latitude},${eventSnapshot.longitude}&travelmode=driving`
    : null

  const emailHtml = buildEmergencyEmailHtml({
    victimName,
    vehicleNumber,
    bystanderName,
    bystanderPhone,
    incidentId,
    mapLink,
    navLink,
    trackingUrl,
  })

  const results = await Promise.allSettled(
    contacts.flatMap(contact => {
      const jobs: Promise<void>[] = []

      if (contact.phone) {
        // SMS
        jobs.push(sendNotification({
          emergencyEventId,
          contactName: contact.name,
          contactPhone: contact.phone,
          channel: 'SMS',
          sendFn: () => sendSms(contact.phone, smsMessage),
        }))

        // WhatsApp
        jobs.push(sendNotification({
          emergencyEventId,
          contactName: contact.name,
          contactPhone: contact.phone,
          channel: 'WHATSAPP',
          sendFn: () => sendWhatsApp(contact.phone, smsMessage),
        }))
      }

      if (contact.email) {
        jobs.push(sendNotification({
          emergencyEventId,
          contactName: contact.name,
          contactEmail: contact.email,
          channel: 'EMAIL',
          sendFn: () => sendEmail({
            to: contact.email!,
            subject: `🚨 EMERGENCY: ${victimName} — ${incidentId ?? 'Road Accident'}`,
            html: emailHtml,
          }),
        }))
      }

      return jobs
    })
  )

  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) logger.warn(`${failed} notifications failed for event ${emergencyEventId}`)
}

// ─── Hospital pre-alert ───────────────────────────────────────────
export async function sendHospitalPreAlert(
  hospitalId: string,
  eventId: string,
  medicalProfile: {
    fullName: string
    bloodGroup?: string | null
    allergies: string[]
    chronicConditions: string[]
    currentMedications: string[]
    organDonor: boolean
    medicalNotes?: string | null
  },
  etaMinutes: number,
  lat: number,
  lng: number
) {
  try {
    const hospital = await prisma.hospital.findUnique({ where: { id: hospitalId } })
    if (!hospital?.emergencyEmail) return

    const mapLink = `https://maps.google.com/?q=${lat},${lng}`

    const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
  <div style="background:#dc2626;padding:24px;text-align:center">
    <h1 style="color:white;margin:0;font-size:22px">🚨 INCOMING EMERGENCY PATIENT</h1>
    <p style="color:#fca5a5;margin:8px 0 0;font-size:14px">ETA: <strong>~${etaMinutes} minutes</strong> — Prepare trauma bay</p>
  </div>
  <div style="padding:24px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#fef2f2">
        <td style="padding:10px;border:1px solid #fecaca;font-weight:bold;width:35%">Patient Name</td>
        <td style="padding:10px;border:1px solid #fecaca;font-weight:bold;font-size:16px">${medicalProfile.fullName}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb">Blood Group</td>
        <td style="padding:10px;border:1px solid #e5e7eb;font-weight:bold;color:#dc2626;font-size:18px">${medicalProfile.bloodGroup || '⚠️ Unknown'}</td>
      </tr>
      <tr style="background:#fafafa">
        <td style="padding:10px;border:1px solid #e5e7eb">Allergies</td>
        <td style="padding:10px;border:1px solid #e5e7eb">${medicalProfile.allergies.length ? `<strong style="color:#dc2626">${medicalProfile.allergies.join(', ')}</strong>` : 'None known'}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb">Chronic Conditions</td>
        <td style="padding:10px;border:1px solid #e5e7eb">${medicalProfile.chronicConditions.length ? medicalProfile.chronicConditions.join(', ') : 'None known'}</td>
      </tr>
      <tr style="background:#fafafa">
        <td style="padding:10px;border:1px solid #e5e7eb">Current Medications</td>
        <td style="padding:10px;border:1px solid #e5e7eb">${medicalProfile.currentMedications.length ? medicalProfile.currentMedications.join(', ') : 'None'}</td>
      </tr>
      <tr>
        <td style="padding:10px;border:1px solid #e5e7eb">Organ Donor</td>
        <td style="padding:10px;border:1px solid #e5e7eb">${medicalProfile.organDonor ? '✅ Registered organ donor' : '❌ Not registered'}</td>
      </tr>
    </table>
    ${medicalProfile.medicalNotes ? `<div style="margin-top:12px;padding:12px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca"><p style="margin:0;color:#991b1b;font-size:14px"><strong>⚠️ Medical Notes:</strong> ${medicalProfile.medicalNotes}</p></div>` : ''}
    <div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd">
      <p style="margin:0 0 6px"><a href="${mapLink}" style="color:#0369a1;font-weight:bold;font-size:15px">📍 View Accident Location on Map</a></p>
    </div>
    <p style="margin-top:16px;font-size:11px;color:#9ca3af">Event ID: ${eventId} | Sent by RoadSafe Emergency Platform | Do not reply</p>
  </div>
</div>`

    await sendEmail({
      to: hospital.emergencyEmail,
      subject: `🚨 TRAUMA INCOMING — ETA ${etaMinutes}min — ${medicalProfile.fullName} — Blood: ${medicalProfile.bloodGroup || 'Unknown'}`,
      html,
    })

    logger.info('Hospital pre-alert sent', { hospitalId, eventId, eta: etaMinutes })
  } catch (err) {
    logger.error('Hospital pre-alert failed', { hospitalId, eventId, err })
  }
}

// ─── Internal helpers ─────────────────────────────────────────────

interface NotifJob {
  emergencyEventId: string
  contactName: string
  contactPhone?: string
  contactEmail?: string
  channel: 'SMS' | 'EMAIL' | 'WHATSAPP' | 'PUSH'
  sendFn: () => Promise<void>
}

async function sendNotification(job: NotifJob): Promise<void> {
  const notif = await prisma.notification.create({
    data: {
      emergencyEventId: job.emergencyEventId,
      contactName: job.contactName,
      contactPhone: job.contactPhone,
      contactEmail: job.contactEmail,
      channel: job.channel,
      status: 'PENDING',
    },
  })

  try {
    await job.sendFn()
    await prisma.notification.update({
      where: { id: notif.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await prisma.notification.update({
      where: { id: notif.id },
      data: { status: 'FAILED', errorMessage, retryCount: { increment: 1 } },
    })
    logger.error('Notification send failed', {
      channel: job.channel,
      contact: job.contactName,
      error: errorMessage,
    })
    throw err
  }
}

interface EmailParams {
  victimName: string
  vehicleNumber: string
  bystanderName?: string | null
  bystanderPhone?: string | null
  incidentId?: string
  mapLink: string | null
  navLink: string | null
  trackingUrl?: string
}

function buildEmergencyEmailHtml(p: EmailParams): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
  <div style="background:#dc2626;padding:28px;border-radius:12px 12px 0 0;text-align:center">
    <h1 style="color:white;margin:0;font-size:26px">🚨 EMERGENCY ALERT</h1>
    ${p.incidentId ? `<p style="color:#fca5a5;margin:8px 0 0;font-size:13px">Incident ID: <strong>${p.incidentId}</strong></p>` : ''}
  </div>
  <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="margin:0 0 8px;color:#111827;font-size:18px;font-weight:bold">${p.victimName} may have been in a road accident</p>
      <p style="margin:0;color:#6b7280;font-size:14px">Vehicle: <strong>${p.vehicleNumber}</strong></p>
    </div>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
      ${p.bystanderName ? `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;color:#6b7280;width:40%">Reported by</td>
        <td style="padding:8px;border-bottom:1px solid #f3f4f6;font-weight:bold">${p.bystanderName}${p.bystanderPhone ? ` (${p.bystanderPhone})` : ''}</td>
      </tr>` : ''}
    </table>

    <div style="display:flex;flex-direction:column;gap:10px">
      ${p.mapLink ? `
      <a href="${p.mapLink}" style="display:block;background:#dc2626;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;text-align:center">
        📍 View Accident Location
      </a>` : ''}
      ${p.navLink ? `
      <a href="${p.navLink}" style="display:block;background:#16a34a;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;text-align:center">
        🧭 Navigate to Scene (No Traffic)
      </a>` : ''}
      ${p.trackingUrl ? `
      <a href="${p.trackingUrl}" style="display:block;background:#2563eb;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;text-align:center">
        📡 Live Tracking Page
      </a>` : ''}
    </div>

    <div style="margin-top:20px;padding:12px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
      <p style="margin:0;color:#166534;font-size:13px">📞 <strong>Call 112</strong> for emergency services &nbsp;|&nbsp; Contact the bystander directly if number is provided</p>
    </div>
    <p style="color:#9ca3af;font-size:11px;margin-top:16px">This automated alert was sent by RoadSafe Emergency Platform. Do not reply to this email.</p>
  </div>
</div>`
}
