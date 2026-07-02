import { Router, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { authenticate, requireRole } from '../../middleware/authenticate'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'

const router = Router()
router.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'))

// GET /api/admin/stats
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const [totalUsers, totalVehicles, totalEvents, activeEvents, todayEvents] = await Promise.all([
    prisma.user.count(),
    prisma.vehicle.count({ where: { isActive: true } }),
    prisma.emergencyEvent.count(),
    prisma.emergencyEvent.count({ where: { status: 'ACTIVE' } }),
    prisma.emergencyEvent.count({
      where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
  ])

  const eventsByStatus = await prisma.emergencyEvent.groupBy({
    by: ['status'],
    _count: true,
  })

  const recentEvents = await prisma.emergencyEvent.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
    include: {
      qrCode: { include: { vehicle: { select: { vehicleNumber: true } } } },
      hospital: { select: { name: true } },
    },
  })

  res.json({
    success: true,
    data: { totalUsers, totalVehicles, totalEvents, activeEvents, todayEvents, eventsByStatus, recentEvents },
  })
}))

// GET /api/admin/users
router.get('/users', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const search = req.query.search as string

  const where = search ? {
    OR: [
      { email: { contains: search, mode: 'insensitive' as const } },
      { profile: { fullName: { contains: search, mode: 'insensitive' as const } } },
    ],
  } : {}

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, phone: true, role: true,
        isActive: true, emailVerified: true, lastLoginAt: true, createdAt: true,
        profile: { select: { fullName: true, photoUrl: true } },
        _count: { select: { vehicles: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ])

  res.json({ success: true, data: { users, total, page, pages: Math.ceil(total / limit) } })
}))

// PUT /api/admin/users/:id/status
router.put('/users/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive },
    select: { id: true, email: true, isActive: true },
  })
  res.json({ success: true, data: { user } })
}))

// GET /api/admin/events
router.get('/events', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 20
  const status = req.query.status as string

  const where = status ? { status: status as any } : {}

  const [events, total] = await Promise.all([
    prisma.emergencyEvent.findMany({
      where,
      include: {
        qrCode: { include: { vehicle: { select: { vehicleNumber: true, vehicleType: true } } } },
        hospital: { select: { name: true } },
        timeline: { orderBy: { createdAt: 'asc' }, take: 5 },
        _count: { select: { notifications: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.emergencyEvent.count({ where }),
  ])

  res.json({ success: true, data: { events, total, page, pages: Math.ceil(total / limit) } })
}))

// GET /api/admin/audit-logs
router.get('/audit-logs', asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 50
  const action = req.query.action as string

  const where = action ? { action } : {}

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { email: true, profile: { select: { fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  res.json({ success: true, data: { logs, total, page, pages: Math.ceil(total / limit) } })
}))

// Hospital management
router.post('/hospitals', asyncHandler(async (req: Request, res: Response) => {
  const hospital = await prisma.hospital.create({ data: req.body })
  res.status(201).json({ success: true, data: { hospital } })
}))

router.put('/hospitals/:id', asyncHandler(async (req: Request, res: Response) => {
  const hospital = await prisma.hospital.update({ where: { id: req.params.id }, data: req.body })
  res.json({ success: true, data: { hospital } })
}))

export default router
