jest.mock('../../config/database', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    qrCode: {
      update: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    parkingQr: {
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('../../utils/storage', () => ({
  uploadToS3: jest.fn().mockResolvedValue('https://s3.example.com/qr.png'),
}))

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    QR_JWT_SECRET: 'test_qr_secret_that_is_long_enough_32chars',
    APP_URL: 'http://localhost:3000',
  },
}))

import { generateQrForVehicle, verifyQrToken } from '../../modules/vehicles/qr.service'
import { prisma } from '../../config/database'
import { AppError } from '../../utils/AppError'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('QrService', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('generateQrForVehicle', () => {
    it('generates QR and returns token + image URL', async () => {
      ;(mockPrisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
        id: 'veh_001',
        vehicleNumber: 'TS09EA1234',
        userId: 'user_001',
        qrCode: null,
      })
      ;(mockPrisma.qrCode.create as jest.Mock).mockResolvedValue({
        id: 'qr_001',
        vehicleId: 'veh_001',
        token: 'generated_token',
        qrImageUrl: 'https://s3.example.com/qr.png',
        isActive: true,
      })

      const result = await generateQrForVehicle('veh_001', 'user_001')

      expect(result.qrCode).toBeDefined()
      expect(result.qrImageUrl).toBe('https://s3.example.com/qr.png')
      expect(result.qrUrl).toContain('http://localhost:3000/emergency/')
    })

    it('deactivates existing QR before creating new one', async () => {
      ;(mockPrisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
        id: 'veh_001',
        vehicleNumber: 'TS09EA1234',
        userId: 'user_001',
        qrCode: { id: 'old_qr', isActive: true },
      })
      ;(mockPrisma.qrCode.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.qrCode.create as jest.Mock).mockResolvedValue({
        id: 'qr_002',
        token: 'new_token',
        qrImageUrl: 'https://s3.example.com/new_qr.png',
        isActive: true,
      })

      await generateQrForVehicle('veh_001', 'user_001')

      expect(mockPrisma.qrCode.update).toHaveBeenCalledWith({
        where: { id: 'old_qr' },
        data: { isActive: false },
      })
    })

    it('throws 404 if vehicle not found or not owned', async () => {
      ;(mockPrisma.vehicle.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(generateQrForVehicle('veh_bad', 'user_001')).rejects.toThrow(AppError)
    })
  })

  describe('verifyQrToken', () => {
    it('returns vehicleId for valid token', async () => {
      // Generate a real token first
      ;(mockPrisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
        id: 'veh_001',
        vehicleNumber: 'TS09EA1234',
        userId: 'user_001',
        qrCode: null,
      })
      ;(mockPrisma.qrCode.create as jest.Mock).mockResolvedValue({
        id: 'qr_001',
        token: 'tok',
        qrImageUrl: 'https://s3.example.com/qr.png',
        isActive: true,
      })

      const { qrUrl } = await generateQrForVehicle('veh_001', 'user_001')
      const token = qrUrl.split('/').pop()!

      const payload = await verifyQrToken(token)
      expect(payload.vehicleId).toBe('veh_001')
    })

    it('throws 400 on tampered token', async () => {
      await expect(verifyQrToken('tampered.invalid.token')).rejects.toThrow(AppError)
    })
  })
})
