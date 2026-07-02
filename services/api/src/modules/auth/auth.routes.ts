import { Router, Request, Response, NextFunction } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import * as authService from './auth.service'
import { authenticate } from '../../middleware/authenticate'
import { validate } from '../../middleware/validate'
import { asyncHandler } from '../../utils/asyncHandler'

const router = Router()

// ─── Rate limiters ───────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,
  message: { success: false, message: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
})

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Try again in 1 hour.' },
})

// ─── Validators ──────────────────────────────────────────────────

const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number with country code (+91XXXXXXXXXX)').optional(),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain uppercase letter')
      .regex(/[0-9]/, 'Must contain number')
      .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  }),
})

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
})

const forgotEmailSchema = z.object({
  body: z.object({ email: z.string().email() }),
})

const resetWithTokenSchema = z.object({
  body: z.object({
    userId: z.string(),
    token: z.string(),
    password: z.string().min(8)
      .regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  }),
})

const sendOtpSchema = z.object({
  body: z.object({
    phone: z.string().regex(/^\+91[6-9]\d{9}$/),
    purpose: z.enum(['PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA']),
  }),
})

const verifyOtpSchema = z.object({
  body: z.object({
    phone: z.string(),
    code: z.string().length(6),
    purpose: z.enum(['PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA']),
  }),
})

const resetWithOtpSchema = z.object({
  body: z.object({
    phone: z.string(),
    otp: z.string().length(6),
    password: z.string().min(8)
      .regex(/[A-Z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/),
  }),
})

// ─── Routes ──────────────────────────────────────────────────────

// POST /api/auth/register
router.post('/register', authLimiter, validate(registerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const user = await authService.register(req.body, req.ip)
    res.status(201).json({
      success: true,
      message: 'Account created. Please verify your email.',
      data: { user },
    })
  })
)

// POST /api/auth/login
router.post('/login', authLimiter, validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.login({
      ...req.body,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      deviceInfo: { userAgent: req.get('user-agent') },
    })

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7d
    })

    res.json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
        expiresIn: result.tokens.expiresIn,
      },
    })
  })
)

// POST /api/auth/logout
router.post('/logout', authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(' ')[1] ?? ''
    await authService.logout(token, req.user!.id)
    res.clearCookie('refreshToken')
    res.json({ success: true, message: 'Logged out successfully' })
  })
)

// POST /api/auth/refresh
router.post('/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'No refresh token' })
    }

    const tokens = await authService.refreshTokens(refreshToken)

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })

    res.json({ success: true, data: { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn } })
  })
)

// GET /api/auth/me
router.get('/me', authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    res.json({ success: true, data: { user: req.user } })
  })
)

// POST /api/auth/verify-email
router.post('/verify-email',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body
    await authService.verifyEmail(token)
    res.json({ success: true, message: 'Email verified successfully' })
  })
)

// POST /api/auth/send-otp
router.post('/send-otp', otpLimiter, validate(sendOtpSchema), authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { phone, purpose } = req.body
    await authService.sendPhoneOtp(req.user!.id, phone, purpose)
    res.json({ success: true, message: 'OTP sent to your mobile number' })
  })
)

// POST /api/auth/verify-otp
router.post('/verify-otp', authenticate, validate(verifyOtpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { phone, code, purpose } = req.body
    await authService.verifyPhoneOtp(req.user!.id, phone, code, purpose)
    res.json({ success: true, message: 'Phone number verified' })
  })
)

// POST /api/auth/forgot-password (email)
router.post('/forgot-password', authLimiter, validate(forgotEmailSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await authService.forgotPasswordEmail(req.body.email)
    res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' })
  })
)

// POST /api/auth/reset-password (token from email link)
router.post('/reset-password', authLimiter, validate(resetWithTokenSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { userId, token, password } = req.body
    await authService.resetPasswordWithToken(userId, token, password)
    res.json({ success: true, message: 'Password reset successfully. Please login.' })
  })
)

// POST /api/auth/forgot-password/phone
router.post('/forgot-password/phone', otpLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { phone } = req.body
    await authService.forgotPasswordPhone(phone)
    res.json({ success: true, message: 'If this number is registered, an OTP has been sent.' })
  })
)

// POST /api/auth/reset-password/phone
router.post('/reset-password/phone', authLimiter, validate(resetWithOtpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { phone, otp, password } = req.body
    await authService.resetPasswordWithOtp(phone, otp, password)
    res.json({ success: true, message: 'Password reset successfully. Please login.' })
  })
)

export default router
