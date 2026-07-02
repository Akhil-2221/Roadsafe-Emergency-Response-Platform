import { Router, Request, Response } from 'express'
import { z } from 'zod'
import multer from 'multer'
import { prisma } from '../../config/database'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import { asyncHandler } from '../../utils/asyncHandler'
import { uploadToS3 } from '../../utils/storage'
import { AppError } from '../../utils/AppError'

const router = Router()
router.use(authenticate)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new AppError('Images only', 400) as any, false)
    cb(null, true)
  },
})

const profileSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(100),
    dateOfBirth: z.string().optional(),
    bloodGroup: z.union([
  z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  z.literal('')
]).optional(),
    allergies: z.array(z.string()).optional(),
    chronicConditions: z.array(z.string()).optional(),
    currentMedications: z.array(z.string()).optional(),
    organDonor: z.boolean().optional(),
    medicalNotes: z.string().max(500).optional(),
  }),
})

const contactSchema = z.object({
  body: z.object({
    relationship: z.enum(['FATHER', 'MOTHER', 'SIBLING', 'SPOUSE', 'RELATIVE', 'FRIEND', 'OTHER']),
    name: z.string().min(2).max(100),
    phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
    email: z.string().email().optional(),
    priority: z.number().int().min(1).max(10).default(1),
  }),
})

// GET /api/profile
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const profile = await prisma.profile.findUnique({
    where: { userId: req.user!.id },
    include: { emergencyContacts: { where: { isActive: true }, orderBy: { priority: 'asc' } } },
  })
  if (!profile) throw new AppError('Profile not found', 404)
  res.json({ success: true, data: { profile } })
}))

// PUT /api/profile
// PUT /api/profile
router.put(
  '/',
  validate(profileSchema),
  asyncHandler(async (req: Request, res: Response) => {

    const data = {
      ...req.body,

      // Convert empty date to null
      dateOfBirth:
        req.body.dateOfBirth && req.body.dateOfBirth.trim() !== ''
          ? new Date(req.body.dateOfBirth)
          : null,

      // Convert empty blood group to null
      bloodGroup:
        req.body.bloodGroup && req.body.bloodGroup.trim() !== ''
          ? req.body.bloodGroup
          : null,
    }

    const profile = await prisma.profile.upsert({
      where: {
        userId: req.user!.id,
      },
      create: {
        userId: req.user!.id,
        ...data,
      },
      update: data,
    })

    res.json({
      success: true,
      data: { profile },
    })
  })
)
// POST /api/profile/photo
router.post('/photo', upload.single('photo'), asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('No photo uploaded', 400)

  const url = await uploadToS3(
    req.file.buffer,
    `profiles/${req.user!.id}/photo-${Date.now()}.jpg`,
    req.file.mimetype
  )

  await prisma.profile.update({ where: { userId: req.user!.id }, data: { photoUrl: url } })
  res.json({ success: true, data: { photoUrl: url } })
}))

// GET /api/profile/emergency-contacts
router.get('/emergency-contacts', asyncHandler(async (req: Request, res: Response) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.user!.id } })
  if (!profile) throw new AppError('Profile not found', 404)

  const contacts = await prisma.emergencyContact.findMany({
    where: { profileId: profile.id, isActive: true },
    orderBy: { priority: 'asc' },
  })
  res.json({ success: true, data: { contacts } })
}))

// POST /api/profile/emergency-contacts
router.post('/emergency-contacts', validate(contactSchema), asyncHandler(async (req: Request, res: Response) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.user!.id } })
  if (!profile) throw new AppError('Profile not found', 404)

  const count = await prisma.emergencyContact.count({ where: { profileId: profile.id, isActive: true } })
  if (count >= 5) throw new AppError('Maximum 5 emergency contacts allowed', 400)

  const contact = await prisma.emergencyContact.create({
    data: { profileId: profile.id, ...req.body },
  })
  res.status(201).json({ success: true, data: { contact } })
}))

// PUT /api/profile/emergency-contacts/:id
// PUT /api/profile
// PUT /api/profile
// PUT /api/profile/emergency-contacts/:id
router.put(
  '/emergency-contacts/:id',
  validate(contactSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const profile = await prisma.profile.findUnique({
      where: { userId: req.user!.id },
    })

    if (!profile) {
      throw new AppError('Profile not found', 404)
    }

    const existing = await prisma.emergencyContact.findUnique({
      where: { id: req.params.id },
    })

    if (!existing || existing.profileId !== profile.id) {
      throw new AppError('Emergency contact not found', 404)
    }

    const contact = await prisma.emergencyContact.update({
      where: { id: req.params.id },
      data: {
        relationship: req.body.relationship,
        name: req.body.name,
        phone: req.body.phone,
        email: req.body.email,
        priority: req.body.priority,
      },
    })

    res.json({
      success: true,
      data: { contact },
    })
  })
)

// DELETE /api/profile/emergency-contacts/:id
router.delete('/emergency-contacts/:id', asyncHandler(async (req: Request, res: Response) => {
  const profile = await prisma.profile.findUnique({ where: { userId: req.user!.id } })
  if (!profile) throw new AppError('Profile not found', 404)

  const contact = await prisma.emergencyContact.findUnique({ where: { id: req.params.id } })
  if (!contact || contact.profileId !== profile.id) throw new AppError('Contact not found', 404)

  await prisma.emergencyContact.update({ where: { id: req.params.id }, data: { isActive: false } })
  res.json({ success: true, message: 'Contact removed' })
}))

export default router
