import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),

  // Database - REQUIRED
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis - optional, graceful degradation
  REDIS_URL: z.string().optional(),

  // JWT - REQUIRED
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // QR signing - REQUIRED
  QR_JWT_SECRET: z.string().min(32, 'QR_JWT_SECRET must be at least 32 chars'),

  // Security
  BCRYPT_ROUNDS: z.string().default('12'),
  COOKIE_SECRET: z.string().min(32).default('dev-cookie-secret-change-in-production-32c'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),

  // AWS S3 - optional
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  // Twilio - optional
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),

  // SendGrid - optional
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().email().default('noreply@roadsafe.in'),
  SENDGRID_FROM_NAME: z.string().default('RoadSafe Emergency'),

  // Firebase - optional
  FIREBASE_SERVER_KEY: z.string().optional(),

  // Google Maps - optional
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // AI service
  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  AI_SERVICE_KEY: z.string().optional(),

  // Anthropic (for AI service)
  ANTHROPIC_API_KEY: z.string().optional(),

  // Medical encryption - optional
  MEDICAL_ENCRYPTION_KEY: z.string().optional(),

  // App URL — THIS IS BAKED INTO EVERY GENERATED QR CODE.
  // "localhost" only resolves on the machine that generated it, so QR codes
  // will fail to open on any other phone/device. For QR codes to scan from
  // *any* phone, set this to either:
  //   - your machine's LAN IP, e.g. http://192.168.1.23:3000 (same Wi-Fi only)
  //   - a tunnel URL, e.g. https://xxxx.ngrok.io (works over mobile data too)
  //   - your real deployed domain, e.g. https://roadsafe.in (production)
  // Run `bash scripts/set-lan-url.sh` to auto-detect your LAN IP and update
  // both this file and apps/web/.env.local. Regenerate QR codes after changing
  // this — existing QR images have the old URL baked in.
  APP_URL: z.string().default('http://localhost:3000'),

  // Bystander OTP gate — kept as a kill-switch for local/offline testing only.
  // In production this must stay true: mobile + OTP is now the ONLY
  // authentication step before an emergency is reported (photo/selfie capture
  // was removed to keep the flow fast). Turning this off should only ever be
  // done in a trusted dev environment.
  REQUIRE_BYSTANDER_OTP: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Missing required environment variables:')
  const errors = parsed.error.flatten().fieldErrors
  Object.entries(errors).forEach(([key, msgs]) => {
    console.error(`  ${key}: ${msgs?.join(', ')}`)
  })
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
