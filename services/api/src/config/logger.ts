import winston from 'winston'
import 'winston-daily-rotate-file'
import { env } from './env'

const { combine, timestamp, json, colorize, printf, errors } = winston.format

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${ts} ${level}: ${stack || message}${metaStr}`
  })
)

const prodFormat = combine(timestamp(), errors({ stack: true }), json())

const transports: winston.transport[] = [
  new winston.transports.Console({ silent: env.NODE_ENV === 'test' }),
]

if (env.NODE_ENV === 'production') {
  transports.push(
    new (winston.transports as any).DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
    new (winston.transports as any).DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  )
}

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports,
  exitOnError: false,
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason })
})

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: (err as Error).message, stack: (err as Error).stack })
  process.exit(1)
})
