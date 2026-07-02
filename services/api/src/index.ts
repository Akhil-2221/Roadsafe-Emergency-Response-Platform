import dotenv from 'dotenv'
import path from 'path'

dotenv.config({
  path: path.resolve(process.cwd(), '.env')
})

import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'

import { env } from './config/env'
import { logger } from './config/logger'
import { prisma } from './config/database'
import { redis } from './config/redis'
import { errorHandler } from './middleware/errorHandler'
import { requestId } from './middleware/requestId'

// Route imports
import authRoutes from './modules/auth/auth.routes'
import profileRoutes from './modules/profile/profile.routes'
import vehicleRoutes from './modules/vehicles/vehicle.routes'
import emergencyRoutes from './modules/emergency/emergency.routes'
import hospitalRoutes from './modules/hospitals/hospital.routes'
import parkingRoutes from './modules/parking/parking.routes'
import adminRoutes from './modules/admin/admin.routes'

import express, { Express } from 'express'

const app: Express = express()
// ─── Trust proxy (needed behind nginx / AWS ALB) ──────────────────
app.set('trust proxy', 1)

// ─── CORS ─────────────────────────────────────────────────────────
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(o => o.trim())

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    // Allow localhost on any port in development
    if (env.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true)
    }
    logger.warn('CORS blocked origin:', { origin })
    callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Device-ID'],
  exposedHeaders: ['X-Request-ID'],
}))

// ─── Security ─────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Managed by Next.js frontend
}))

// ─── Core middleware ──────────────────────────────────────────────
app.use(compression())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(cookieParser(env.COOKIE_SECRET))
app.use(requestId)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health',
  }))
}

// ─── Static uploads (dev only - production uses S3) ───────────────




// ─── Health check ─────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    const redisPing = await redis.ping()
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: 'ok',
        redis: redisPing === 'PONG' ? 'ok' : redisPing === 'DISABLED' ? 'disabled' : 'error',
      },
    })
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: String(err) })
  }
})

// ─── API routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/vehicles', vehicleRoutes)
app.use('/api/emergency', emergencyRoutes)
app.use('/api/hospitals', hospitalRoutes)
app.use('/api/parking', parkingRoutes)
app.use('/api/admin', adminRoutes)

// ─── 404 ──────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

// ─── Error handler ────────────────────────────────────────────────
app.use(errorHandler)

// ─── Start ────────────────────────────────────────────────────────
const PORT = parseInt(env.PORT) || 3001

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚨 RoadSafe API running on http://0.0.0.0:${PORT} [${env.NODE_ENV}]`)
  logger.info(`  CORS origins: ${allowedOrigins.join(', ')}`)
})

// ─── Graceful shutdown ────────────────────────────────────────────
const shutdown = async () => {
  logger.info('Shutting down...')
  server.close(async () => {
    await prisma.$disconnect()
    redis.disconnect()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10000) // Force kill after 10s
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export default app
