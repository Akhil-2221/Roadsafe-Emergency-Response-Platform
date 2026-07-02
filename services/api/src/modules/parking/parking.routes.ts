import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { asyncHandler } from '../../utils/asyncHandler'
import { validate } from '../../middleware/validate'
import { AppError } from '../../utils/AppError'
import { sendSms } from '../../utils/sms'

const router = Router()

const contactSchema = z.object({
  body: z.object({
    callerName: z.string().min(2).max(100),
    callerPhone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
    reason: z.enum(['BLOCKING_GATE', 'BLOCKING_VEHICLE', 'WRONG_PARKING', 'EMERGENCY', 'OTHER']),
    message: z.string().max(200).optional(),
  }),
})

// POST /api/parking/scan/:token
// Verify parking QR token, return masked vehicle info
router.post('/scan/:token', asyncHandler(async (req: Request, res: Response) => {
  const parkingQr = await prisma.parkingQr.findUnique({
    where: { token: req.params.token, isActive: true },
    include: {
      vehicle: {
        select: {
          vehicleNumber: true,
          vehicleType: true,
          color: true,
          make: true,
          model: true,
        },
      },
    },
  })

  if (!parkingQr) throw new AppError('Invalid parking QR', 404)

  res.json({
    success: true,
    data: {
      parkingQrId: parkingQr.id,
      vehicle: parkingQr.vehicle, // No owner identity revealed
    },
  })
}))

// POST /api/parking/:id/notify
// Send notification to vehicle owner
router.post('/:id/notify', validate(contactSchema), asyncHandler(async (req: Request, res: Response) => {
  const parkingQr = await prisma.parkingQr.findUnique({
    where: { id: req.params.id },
    include: {
      vehicle: {
        include: {
          user: { select: { phone: true } },
        },
      },
    },
  })

  if (!parkingQr) throw new AppError('Parking QR not found', 404)

  const { callerName, callerPhone, reason, message } = req.body

  // Store contact record
  const contact = await prisma.parkingContact.create({
    data: {
      parkingQrId: parkingQr.id,
      callerName,
      callerPhone,
      reason,
      message,
      callerIp: req.ip,
    },
  })

  // Notify owner via SMS (masked — caller phone not revealed)
  const ownerPhone = parkingQr.vehicle.user.phone
  if (ownerPhone) {
    const reasonLabels: Record<string, string> = {
      BLOCKING_GATE: 'blocking a gate',
      BLOCKING_VEHICLE: 'blocking another vehicle',
      WRONG_PARKING: 'parked incorrectly',
      EMERGENCY: 'blocking emergency access',
      OTHER: 'causing an issue',
    }
    const smsBody = `🚗 RoadSafe Parking Alert\n\nYour vehicle (${parkingQr.vehicle.vehicleNumber}) is ${reasonLabels[reason]}.\n${message ? `Note: ${message}\n` : ''}Please move it as soon as possible.`

    await sendSms(ownerPhone, smsBody)
    await prisma.parkingContact.update({ where: { id: contact.id }, data: { notifiedAt: new Date() } })
  }

  res.json({ success: true, message: 'Vehicle owner has been notified' })
}))

export default router
