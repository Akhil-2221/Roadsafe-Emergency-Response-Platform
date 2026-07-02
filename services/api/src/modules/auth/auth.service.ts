import bcrypt from 'bcrypt'
import jwt, { Secret, SignOptions } from 'jsonwebtoken'
import { randomBytes } from 'crypto'
import { prisma } from '../../config/database'
import { redis } from '../../config/redis'
import { env } from '../../config/env'
import { logger } from '../../config/logger'
import { AppError } from '../../utils/AppError'
import { sendEmail } from '../../utils/email'
import { sendSms } from '../../utils/sms'
import { generateOtp } from '../../utils/otp'
import { auditLog } from '../../utils/audit'

const BCRYPT_ROUNDS = parseInt(env.BCRYPT_ROUNDS)
const MAX_LOGIN_ATTEMPTS = 5
const LOCK_DURATION_MINUTES = 15
const OTP_EXPIRY_MINUTES = 10
const OTP_MAX_ATTEMPTS = 3
const PASSWORD_RESET_EXPIRY_MINUTES = 30

// ─── Types ───────────────────────────────────────────────────────

interface RegisterInput {
  fullName: string
  email: string
  phone?: string
  password: string
}

interface LoginInput {
  email: string
  password: string
  deviceInfo?: object
  ipAddress?: string
  userAgent?: string
}

interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

// ─── Token helpers ───────────────────────────────────────────────

function generateTokenPair(userId: string, role: string): TokenPair {
const accessToken = jwt.sign(
  { sub: userId, role },
  env.JWT_SECRET as Secret,
  { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] }
)

const refreshToken = jwt.sign(
  { sub: userId, type: 'refresh' },
  env.JWT_REFRESH_SECRET as Secret,
  { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"] }
)
  return { accessToken, refreshToken, expiresIn: 15 * 60 } // 15 min in seconds
}

// ─── Register ────────────────────────────────────────────────────

export async function register(input: RegisterInput, ipAddress?: string) {
  const { fullName, email, phone, password } = input

  // Check duplicate email
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new AppError('Email already registered', 409)

  // Check duplicate phone
  if (phone) {
    const phoneExists = await prisma.user.findUnique({ where: { phone } })
    if (phoneExists) throw new AppError('Phone number already registered', 409)
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)

  const user = await prisma.user.create({
    data: {
      email,
      phone,
      passwordHash,
      profile: {
        create: { fullName },
      },
    },
    select: { id: true, email: true, phone: true, role: true },
  })

  // Send email verification
  await sendEmailVerification(user.id, email)

  // If phone provided, send OTP
  if (phone) {
    await sendPhoneOtp(user.id, phone, 'PHONE_VERIFY')
  }

  await auditLog(user.id, 'REGISTER', 'User', user.id, ipAddress)

  logger.info('User registered', { userId: user.id, email })
  return user
}

// ─── Login ───────────────────────────────────────────────────────

export async function login(input: LoginInput) {
  const { email, password, deviceInfo, ipAddress, userAgent } = input

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      phone: true,
      passwordHash: true,
      role: true,
      isActive: true,
      emailVerified: true,
      failedLoginCount: true,
      lockedUntil: true,
    },
  })

  if (!user) throw new AppError('Invalid email or password', 401)
  if (!user.isActive) throw new AppError('Account is deactivated', 403)

  // Check lock
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
    throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 429)
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash)

  if (!passwordValid) {
    const newCount = user.failedLoginCount + 1
    const update: any = { failedLoginCount: newCount }

    if (newCount >= MAX_LOGIN_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
      update.failedLoginCount = 0
    }

    await prisma.user.update({ where: { id: user.id }, data: update })
    await auditLog(user.id, 'LOGIN_FAILED', 'User', user.id, ipAddress)
    throw new AppError('Invalid email or password', 401)
  }

  // Reset failed count on success
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: ipAddress },
  })

  const tokens = generateTokenPair(user.id, user.role)

  // Persist session
  await prisma.session.create({
    data: {
      userId: user.id,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceInfo: deviceInfo as any,
      ipAddress,
      userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7d
    },
  })

  await auditLog(user.id, 'LOGIN', 'User', user.id, ipAddress)

  return {
    user: { id: user.id, email: user.email, phone: user.phone, role: user.role, emailVerified: user.emailVerified },
    tokens,
  }
}

// ─── Logout ──────────────────────────────────────────────────────

export async function logout(accessToken: string, userId: string) {
  await prisma.session.updateMany({
    where: { token: accessToken, userId },
    data: { isValid: false },
  })

  // Blacklist token in Redis for remaining TTL
  const decoded = jwt.decode(accessToken) as any
  if (decoded?.exp) {
    const ttl = decoded.exp - Math.floor(Date.now() / 1000)
    if (ttl > 0) await redis.setex(`blacklist:${accessToken}`, ttl, '1')
  }
}

// ─── Refresh token ───────────────────────────────────────────────

export async function refreshTokens(refreshToken: string) {
  let payload: any
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET)
  } catch {
    throw new AppError('Invalid or expired refresh token', 401)
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken },
    include: { user: { select: { id: true, role: true, isActive: true } } },
  })

  if (!session || !session.isValid) throw new AppError('Session expired. Please login again.', 401)
  if (!session.user.isActive) throw new AppError('Account deactivated', 403)

  const tokens = generateTokenPair(session.userId, session.user.role)

  // Rotate: invalidate old session, create new one
  await prisma.session.update({ where: { id: session.id }, data: { isValid: false } })
  await prisma.session.create({
    data: {
      userId: session.userId,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      deviceInfo: session.deviceInfo ?? undefined,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })

  return tokens
}

// ─── Email verification ──────────────────────────────────────────

export async function sendEmailVerification(userId: string, email: string) {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

  await prisma.emailVerification.create({ data: { email, token, expiresAt } })

  const link = `${env.APP_URL}/verify-email?token=${token}`

  await sendEmail({
    to: email,
    subject: 'Verify your RoadSafe account',
    html: `
      <h2>Welcome to RoadSafe Emergency</h2>
      <p>Click the link below to verify your email address:</p>
      <a href="${link}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
        Verify Email
      </a>
      <p>This link expires in 24 hours.</p>
      <p>If you didn't create this account, ignore this email.</p>
    `,
  })
}

export async function verifyEmail(token: string) {
  const record = await prisma.emailVerification.findUnique({ where: { token } })

  if (!record) throw new AppError('Invalid verification link', 400)
  if (record.used) throw new AppError('Verification link already used', 400)
  if (record.expiresAt < new Date()) throw new AppError('Verification link expired', 400)

  await prisma.$transaction([
    prisma.emailVerification.update({ where: { token }, data: { used: true } }),
    prisma.user.update({ where: { email: record.email }, data: { emailVerified: true } }),
  ])
}

// ─── Phone OTP ───────────────────────────────────────────────────

export async function sendPhoneOtp(userId: string, phone: string, purpose: 'PHONE_VERIFY' | 'PASSWORD_RESET' | 'LOGIN_2FA') {
  // Rate limit: max 3 OTPs per hour per phone
  const recentOtps = await prisma.otpCode.count({
    where: {
      phone,
      purpose,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
    },
  })
  if (recentOtps >= 3) throw new AppError('Too many OTP requests. Try again after 1 hour.', 429)

  const { code, hash } = await generateOtp()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  await prisma.otpCode.create({ data: { userId, phone, code: hash, purpose, expiresAt } })

  await sendSms(phone, `Your RoadSafe OTP is: ${code}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share.`)
}

export async function verifyPhoneOtp(userId: string, phone: string, code: string, purpose: 'PHONE_VERIFY' | 'PASSWORD_RESET' | 'LOGIN_2FA') {
  const otpRecord = await prisma.otpCode.findFirst({
    where: { userId, phone, purpose, verified: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  if (!otpRecord) throw new AppError('OTP expired or not found. Request a new one.', 400)

  if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError('Too many incorrect attempts. Request a new OTP.', 429)
  }

  const valid = await bcrypt.compare(code, otpRecord.code)

  if (!valid) {
    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    })
    throw new AppError('Incorrect OTP', 400)
  }

  await prisma.otpCode.update({ where: { id: otpRecord.id }, data: { verified: true } })

  if (purpose === 'PHONE_VERIFY') {
    await prisma.user.update({ where: { id: userId }, data: { phoneVerified: true } })
  }
}

// ─── Forgot password (email) ─────────────────────────────────────

export async function forgotPasswordEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  // Always respond OK to prevent user enumeration
  if (!user) return

  const token = randomBytes(32).toString('hex')
  const tokenHash = await bcrypt.hash(token, 10)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000)

  await prisma.passwordReset.create({ data: { userId: user.id, token: tokenHash, expiresAt } })

  const link = `${env.APP_URL}/reset-password?token=${token}&id=${user.id}`

  await sendEmail({
    to: email,
    subject: 'Reset your RoadSafe password',
    html: `
      <h2>Password Reset Request</h2>
      <p>Click below to reset your password. This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.</p>
      <a href="${link}" style="background:#dc2626;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">
        Reset Password
      </a>
      <p>If you didn't request this, ignore this email. Your password won't change.</p>
    `,
  })
}

export async function resetPasswordWithToken(userId: string, token: string, newPassword: string) {
  const records = await prisma.passwordReset.findMany({
    where: { userId, used: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  let validRecord: typeof records[0] | null = null
  for (const record of records) {
    const match = await bcrypt.compare(token, record.token)
    if (match) { validRecord = record; break }
  }

  if (!validRecord) throw new AppError('Invalid or expired reset link', 400)

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: validRecord.id }, data: { used: true } }),
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Invalidate all sessions
    prisma.session.updateMany({ where: { userId }, data: { isValid: false } }),
  ])

  logger.info('Password reset', { userId })
}

// ─── Forgot password (phone OTP) ─────────────────────────────────

export async function forgotPasswordPhone(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) return // silent — prevent enumeration
  await sendPhoneOtp(user.id, phone, 'PASSWORD_RESET')
}

export async function resetPasswordWithOtp(phone: string, otp: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { phone } })
  if (!user) throw new AppError('Phone not registered', 400)

  await verifyPhoneOtp(user.id, phone, otp, 'PASSWORD_RESET')

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.updateMany({ where: { userId: user.id }, data: { isValid: false } }),
  ])
}
