import bcrypt from 'bcrypt'

// ─── Mock all external dependencies BEFORE importing the service ──
jest.mock('../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    otpCode: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    passwordReset: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    emailVerification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  },
}))

jest.mock('../../config/redis', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  },
}))

jest.mock('../../utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../utils/sms', () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../utils/audit', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test_jwt_secret_that_is_long_enough_32chars',
    JWT_REFRESH_SECRET: 'test_refresh_secret_long_enough_32chars',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    BCRYPT_ROUNDS: '4',
    APP_URL: 'http://localhost:3000',
  },
}))

import * as authService from '../../modules/auth/auth.service'
import { prisma } from '../../config/database'
import { AppError } from '../../utils/AppError'

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ─── register ──────────────────────────────────────────────────
  describe('register', () => {
    it('creates a new user successfully', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)
      ;(mockPrisma.user.create as jest.Mock).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        phone: null,
        role: 'USER',
      })
      ;(mockPrisma.emailVerification.create as jest.Mock).mockResolvedValue({})

      const result = await authService.register({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'Password@123',
      })

      expect(result.email).toBe('test@example.com')
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    })

    it('throws 409 if email already registered', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing',
        email: 'test@example.com',
      })

      await expect(
        authService.register({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'Password@123',
        })
      ).rejects.toThrow(AppError)
    })
  })

  // ─── login ─────────────────────────────────────────────────────
  describe('login', () => {
    const hashedPassword = bcrypt.hashSync('Password@123', 4)

    it('returns tokens on valid credentials', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        phone: '+919876543210',
        passwordHash: hashedPassword,
        role: 'USER',
        isActive: true,
        emailVerified: true,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      ;(mockPrisma.user.update as jest.Mock).mockResolvedValue({})
      ;(mockPrisma.session.create as jest.Mock).mockResolvedValue({})

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password@123',
        ipAddress: '127.0.0.1',
      })

      expect(result.tokens.accessToken).toBeDefined()
      expect(result.tokens.refreshToken).toBeDefined()
      expect(result.user.email).toBe('test@example.com')
    })

    it('throws 401 on wrong password', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'USER',
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      ;(mockPrisma.user.update as jest.Mock).mockResolvedValue({})

      await expect(
        authService.login({ email: 'test@example.com', password: 'WrongPass@123' })
      ).rejects.toThrow(AppError)
    })

    it('throws 401 if user not found', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null)

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'Password@123' })
      ).rejects.toThrow(AppError)
    })

    it('throws 403 if account is deactivated', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'USER',
        isActive: false,
        failedLoginCount: 0,
        lockedUntil: null,
      })

      await expect(
        authService.login({ email: 'test@example.com', password: 'Password@123' })
      ).rejects.toThrow(AppError)
    })

    it('throws 429 if account is locked', async () => {
      ;(mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'user_123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'USER',
        isActive: true,
        failedLoginCount: 0,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // locked for 10 more minutes
      })

      await expect(
        authService.login({ email: 'test@example.com', password: 'Password@123' })
      ).rejects.toThrow(AppError)
    })
  })

  // ─── verifyEmail ───────────────────────────────────────────────
  describe('verifyEmail', () => {
    it('verifies email on valid token', async () => {
      ;(mockPrisma.emailVerification.findUnique as jest.Mock).mockResolvedValue({
        id: 'ver_1',
        email: 'test@example.com',
        token: 'validtoken',
        used: false,
        expiresAt: new Date(Date.now() + 3600000),
      })
      ;(mockPrisma.$transaction as jest.Mock).mockResolvedValue([{}, {}])

      await expect(authService.verifyEmail('validtoken')).resolves.not.toThrow()
    })

    it('throws on expired token', async () => {
      ;(mockPrisma.emailVerification.findUnique as jest.Mock).mockResolvedValue({
        id: 'ver_1',
        email: 'test@example.com',
        token: 'expiredtoken',
        used: false,
        expiresAt: new Date(Date.now() - 1000), // expired
      })

      await expect(authService.verifyEmail('expiredtoken')).rejects.toThrow(AppError)
    })

    it('throws on already used token', async () => {
      ;(mockPrisma.emailVerification.findUnique as jest.Mock).mockResolvedValue({
        id: 'ver_1',
        email: 'test@example.com',
        token: 'usedtoken',
        used: true,
        expiresAt: new Date(Date.now() + 3600000),
      })

      await expect(authService.verifyEmail('usedtoken')).rejects.toThrow(AppError)
    })
  })
})
