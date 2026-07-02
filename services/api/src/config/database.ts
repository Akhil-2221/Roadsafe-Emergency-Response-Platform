import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

const prismaOptions = {
  log: process.env.NODE_ENV === 'development'
    ? [
        { emit: 'event' as const, level: 'error' as const },
        { emit: 'event' as const, level: 'warn' as const },
      ]
    : [{ emit: 'event' as const, level: 'error' as const }],
}

export const prisma = global.__prisma ?? new PrismaClient(prismaOptions)

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

prisma.$on('error', (e) => logger.error('Prisma error:', { message: e.message }))
prisma.$on('warn', (e) => logger.warn('Prisma warning:', { message: e.message }))

// Verify DB connection on startup
prisma.$connect()
  .then(() => logger.info('✅ Database connected'))
  .catch((err) => {
    logger.error('❌ Database connection failed:', { error: err.message })
    logger.error('   Make sure PostgreSQL is running and DATABASE_URL is correct')
    process.exit(1)
  })
