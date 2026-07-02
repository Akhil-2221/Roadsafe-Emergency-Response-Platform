import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { authenticate, requireRole } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import { generateQrForVehicle, generateParkingQr } from './qr.service'

const router = Router()

// All vehicle routes require auth
router.use(authenticate)

const vehicleSchema = z.object({
  body: z.object({
    vehicleNumber: z.string().min(4).max(15).toUpperCase(),
    vehicleType: z.enum(['CAR', 'MOTORCYCLE', 'TRUCK', 'BUS', 'AUTO_RICKSHAW', 'OTHER']),
    make: z.string().max(50).optional(),
    model: z.string().max(50).optional(),
    color: z.string().max(30).optional(),
    yearOfMfg: z.number().int().min(1980).max(new Date().getFullYear()).optional(),
  }),
})

// GET /api/vehicles
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const vehicles = await prisma.vehicle.findMany({
    where: { userId: req.user!.id, isActive: true },
    include: {
      qrCode: { select: { id: true, qrImageUrl: true, scanCount: true, lastScannedAt: true, isActive: true } },
      parkingQr: { select: { id: true, qrImageUrl: true, isActive: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ success: true, data: { vehicles } })
}))

// POST /api/vehicles
router.post('/', validate(vehicleSchema), asyncHandler(async (req: Request, res: Response) => {
  const { vehicleNumber } = req.body

  const exists = await prisma.vehicle.findUnique({ where: { vehicleNumber } })
  if (exists) throw new AppError('Vehicle number already registered', 409)

  const vehicle = await prisma.vehicle.create({
    data: { ...req.body, userId: req.user!.id },
  })
  res.status(201).json({ success: true, data: { vehicle } })
}))

// PUT /api/vehicles/:id
router.put('/:id', validate(vehicleSchema), asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } })
  if (!vehicle || vehicle.userId !== req.user!.id) throw new AppError('Vehicle not found', 404)

  const updated = await prisma.vehicle.update({ where: { id: req.params.id }, data: req.body })
  res.json({ success: true, data: { vehicle: updated } })
}))

// DELETE /api/vehicles/:id
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: req.params.id } })
  if (!vehicle || vehicle.userId !== req.user!.id) throw new AppError('Vehicle not found', 404)

  await prisma.vehicle.update({ where: { id: req.params.id }, data: { isActive: false } })
  res.json({ success: true, message: 'Vehicle removed' })
}))

// POST /api/vehicles/:id/generate-qr
router.post('/:id/generate-qr', asyncHandler(async (req: Request, res: Response) => {
  const result = await generateQrForVehicle(req.params.id, req.user!.id)
  res.json({ success: true, data: result })
}))

// POST /api/vehicles/:id/generate-parking-qr
router.post('/:id/generate-parking-qr', asyncHandler(async (req: Request, res: Response) => {
  const result = await generateParkingQr(req.params.id, req.user!.id)
  res.json({ success: true, data: result })
}))

export default router
