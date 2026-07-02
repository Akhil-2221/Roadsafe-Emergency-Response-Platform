import bcrypt from 'bcrypt'
import { randomInt } from 'crypto'
import { prisma } from '../../config/database'
import { AppError } from '../../utils/AppError'
import { sendSms } from '../../utils/sms'
import { logger } from '../../config/logger'

const OTP_EXPIRY_MINUTES = 10
const OTP_MAX_ATTEMPTS = 3
const MAX_OTPS_PER_HOUR = 5

/**
 * Normalize Indian phone numbers to +91XXXXXXXXXX format.
 * Accepts: 10-digit, 91XXXXXXXXXX, +91XXXXXXXXXX, with/without spaces.
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`
  if (phone.trim().startsWith('+')) return phone.replace(/\s/g, '')
  return `+${digits}`
}

/**
 * Send a 6-digit OTP to a bystander's phone before they're allowed to report
 * an emergency. This is a lightweight anti-abuse / presence-confirmation gate —
 * it does NOT create a User account.
 *
 * Gated by REQUIRE_BYSTANDER_OTP env flag; when disabled, the emergency routes
 * skip this step entirely and bystanders go straight to evidence capture.
 */
export async function sendBystanderOtp(phoneRaw: string): Promise<{ expiresAt: Date }> {
  const phone = normalizePhone(phoneRaw)

  const recentCount = await prisma.bystanderOtp.count({
    where: {
      phone,
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000),
      },
    },
  })

  if (recentCount >= MAX_OTPS_PER_HOUR) {
    throw new AppError(
      'Too many OTP requests for this number. Please wait before trying again.',
      429
    )
  }

  await prisma.bystanderOtp.updateMany({
    where: {
      phone,
      isUsed: false,
    },
    data: {
      isUsed: true,
    },
  })

  const code = String(randomInt(100000, 999999))
  const hash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

  await prisma.bystanderOtp.create({
    data: {
      phone,
      code: hash,
      expiresAt,
    },
  })

  try {
    await sendSms(
      phone,
      `RoadSafe Emergency: Your verification code is ${code}. Valid for ${OTP_EXPIRY_MINUTES} minutes. Do not share this code.`
    )
  } catch (err: any) {
    logger.error("Failed to send bystander OTP SMS", {
      phone,
      message: err.message,
      code: err.code,
      status: err.status,
      moreInfo: err.moreInfo,
    })

    console.error(err)
  }

  logger.info("Bystander OTP sent", { phone })

  return { expiresAt }
}

/**
 * Verify a bystander's OTP. Throws AppError on any failure.
 * On success, marks the OTP as used (single-use).
 */
export async function verifyBystanderOtp(phoneRaw: string, code: string): Promise<void> {
  const phone = normalizePhone(phoneRaw)

  const record = await prisma.bystanderOtp.findFirst({
    where: { phone, isUsed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) throw new AppError('OTP expired or not found. Please request a new one.', 400)

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.bystanderOtp.update({ where: { id: record.id }, data: { isUsed: true } })
    throw new AppError('Too many incorrect attempts. Please request a new OTP.', 429)
  }

  const valid = await bcrypt.compare(code.trim(), record.code)

  if (!valid) {
    await prisma.bystanderOtp.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    const remaining = OTP_MAX_ATTEMPTS - record.attempts - 1
    throw new AppError(`Incorrect code. ${Math.max(remaining, 0)} attempt(s) remaining.`, 400)
  }

  await prisma.bystanderOtp.update({ where: { id: record.id }, data: { isUsed: true } })
  logger.info('Bystander OTP verified', { phone })
}
