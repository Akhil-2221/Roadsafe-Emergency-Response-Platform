jest.mock('../../config/database', () => ({
  prisma: {
    qrCode: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    emergencyEvent: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    timelineEntry: { create: jest.fn() },
    hospital: { findMany: jest.fn() },
    notification: { create: jest.fn(), update: jest.fn() },
    profile: { findUnique: jest.fn() },
  },
}))

jest.mock('../../utils/notifications', () => ({
  notifyContacts: jest.fn().mockResolvedValue(undefined),
  notifyOwnerOfScan: jest.fn().mockResolvedValue(undefined),
  sendHospitalPreAlert: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../utils/storage', () => ({
  uploadToS3: jest.fn().mockResolvedValue('https://s3.example.com/test.jpg'),
}))

jest.mock('../../utils/aiClient', () => ({
  callAiService: jest.fn(),
}))

jest.mock('../../utils/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../config/env', () => ({
  env: { NODE_ENV: 'test', APP_URL: 'http://localhost:3000' },
}))

import * as emergencyService from '../../modules/emergency/emergency.service'
import { prisma } from '../../config/database'
import { callAiService } from '../../utils/aiClient'
import { AppError } from '../../utils/AppError'

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockCallAi = callAiService as jest.MockedFunction<typeof callAiService>

const mockQrCode = {
  id: 'qr_001',
  token: 'valid_token',
  isActive: true,
  scanCount: 0,
  vehicle: {
    vehicleNumber: 'TS09EA1234',
    vehicleType: 'CAR',
    make: 'Maruti',
    model: 'Swift',
    color: 'White',
    userId: 'user_001',
    user: { phone: '+919876543210', profile: { fullName: 'Ravi Kumar' } },
  },
}

const mockEvent = {
  id: 'evt_001',
  qrCodeId: 'qr_001',
  status: 'EVIDENCE_COLLECTED',
  latitude: 17.4238,
  longitude: 78.4569,
  accidentPhotoUrl: 'https://s3.example.com/accident.jpg',
  aiVerdict: null,
  aiVerdictScore: null,
  createdAt: new Date(),
}

describe('EmergencyService', () => {
  beforeEach(() => jest.clearAllMocks())

  // ─── handleQrScan ──────────────────────────────────────────────
  describe('handleQrScan', () => {
    it('returns vehicle info on valid QR token', async () => {
      ;(mockPrisma.qrCode.findUnique as jest.Mock).mockResolvedValue(mockQrCode)
      ;(mockPrisma.emergencyEvent.count as jest.Mock).mockResolvedValue(0)
      ;(mockPrisma.qrCode.update as jest.Mock).mockResolvedValue({})

      const result = await emergencyService.handleQrScan('valid_token', '1.2.3.4')

      expect(result.qrCodeId).toBe('qr_001')
      expect(result.vehicle.vehicleNumber).toBe('TS09EA1234')
      expect(mockPrisma.qrCode.update).toHaveBeenCalledWith({
        where: { id: 'qr_001' },
        data: { scanCount: { increment: 1 }, lastScannedAt: expect.any(Date) },
      })
    })

    it('throws 404 on invalid QR token', async () => {
      ;(mockPrisma.qrCode.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(emergencyService.handleQrScan('bad_token')).rejects.toThrow(AppError)
    })
  })

  // ─── createEmergencyEvent ──────────────────────────────────────
  // Authentication is now bystander mobile + OTP + GPS (no photo needed).
  describe('createEmergencyEvent', () => {
    it('creates event once OTP-verified and activates in the background', async () => {
      ;(mockPrisma.qrCode.findUnique as jest.Mock).mockResolvedValue(mockQrCode)
      ;(mockPrisma.emergencyEvent.create as jest.Mock).mockResolvedValue({ ...mockEvent, status: 'PENDING' })
      ;(mockPrisma.emergencyEvent.findMany as jest.Mock).mockResolvedValue([]) // no prior reports = not flagged
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent) // used by background activateEmergency
      ;(mockPrisma.timelineEntry.create as jest.Mock).mockResolvedValue({})

      const result = await emergencyService.createEmergencyEvent({
        qrCodeId: 'qr_001',
        latitude: 17.4238,
        longitude: 78.4569,
        bystanderName: 'John',
        bystanderPhone: '+919876543210',
        declarationAccepted: true,
        bystanderOtpVerified: true,
      })

      expect(result.id).toBe('evt_001')
      expect(mockPrisma.emergencyEvent.create).toHaveBeenCalledTimes(1)
      expect(mockPrisma.emergencyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ bystanderOtpVerified: true, flaggedForAbuseReview: false }),
        })
      )
    })

    it('rejects if bystander is not OTP-verified', async () => {
      await expect(
        emergencyService.createEmergencyEvent({
          qrCodeId: 'qr_001',
          latitude: 17.4238,
          longitude: 78.4569,
          bystanderPhone: '+919876543210',
          declarationAccepted: true,
          bystanderOtpVerified: false,
        })
      ).rejects.toThrow(AppError)
    })

    it('flags the event when the same phone reports many different vehicles in 24h', async () => {
      ;(mockPrisma.qrCode.findUnique as jest.Mock).mockResolvedValue(mockQrCode)
      ;(mockPrisma.emergencyEvent.findMany as jest.Mock).mockResolvedValue([
        { vehicleId: 'v1', qrCodeId: 'q1' },
        { vehicleId: 'v2', qrCodeId: 'q2' },
        { vehicleId: 'v3', qrCodeId: 'q3' },
        { vehicleId: 'v4', qrCodeId: 'q4' },
      ])
      ;(mockPrisma.emergencyEvent.create as jest.Mock).mockResolvedValue({ ...mockEvent, status: 'PENDING' })
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock).mockResolvedValue(mockEvent)
      ;(mockPrisma.timelineEntry.create as jest.Mock).mockResolvedValue({})

      await emergencyService.createEmergencyEvent({
        qrCodeId: 'qr_001',
        latitude: 17.4238,
        longitude: 78.4569,
        bystanderPhone: '+919876543210',
        declarationAccepted: true,
        bystanderOtpVerified: true,
      })

      expect(mockPrisma.emergencyEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ flaggedForAbuseReview: true }),
        })
      )
    })
  })

  // ─── getMedicalPassport ────────────────────────────────────────
  describe('getMedicalPassport', () => {
    const mockEventWithProfile = {
      ...mockEvent,
      status: 'ACTIVE',
      qrCode: {
        vehicle: {
          user: {
            profile: {
              fullName: 'Ravi Kumar',
              bloodGroup: 'B+',
              allergies: ['Penicillin'],
              chronicConditions: ['Hypertension'],
              currentMedications: ['Amlodipine 5mg'],
              organDonor: true,
              medicalNotes: null,
            },
          },
        },
      },
    }

    it('returns medical passport once bystander is OTP-verified', async () => {
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock).mockResolvedValue({
        ...mockEventWithProfile,
        bystanderOtpVerified: true,
      })
      ;(mockPrisma.timelineEntry.create as jest.Mock).mockResolvedValue({})

      const result = await emergencyService.getMedicalPassport('evt_001', '1.2.3.4')

      expect(result.bloodGroup).toBe('B+')
      expect(result.allergies).toContain('Penicillin')
      expect(result.organDonor).toBe(true)
    })

    it('throws 403 when bystander has not completed OTP verification', async () => {
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock).mockResolvedValue({
        ...mockEventWithProfile,
        status: 'PENDING',
        bystanderOtpVerified: false,
      })

      await expect(emergencyService.getMedicalPassport('evt_001')).rejects.toThrow(AppError)
    })
  })

  // ─── ownerAcknowledgeOk ────────────────────────────────────────
  describe('ownerAcknowledgeOk', () => {
    it('resolves event and notifies contacts', async () => {
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          ...mockEvent,
          status: 'ACTIVE',
          qrCode: { vehicle: { userId: 'user_001' } },
        })
        .mockResolvedValueOnce({
          ...mockEvent,
          qrCode: {
            vehicle: {
              user: {
                profile: {
                  fullName: 'Ravi Kumar',
                  emergencyContacts: [{ name: 'Father', phone: '+919999999999' }],
                },
              },
            },
          },
        })
      ;(mockPrisma.emergencyEvent.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.timelineEntry.create as jest.Mock).mockResolvedValue({})

      await expect(
        emergencyService.ownerAcknowledgeOk('evt_001', 'user_001')
      ).resolves.not.toThrow()

      expect(mockPrisma.emergencyEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RESOLVED', ownerAckedOk: true }),
        })
      )
    })

    it('throws 403 if called by wrong user', async () => {
      ;(mockPrisma.emergencyEvent.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent,
        status: 'ACTIVE',
        qrCode: { vehicle: { userId: 'user_001' } },
      })

      await expect(
        emergencyService.ownerAcknowledgeOk('evt_001', 'user_WRONG')
      ).rejects.toThrow(AppError)
    })
  })
})
