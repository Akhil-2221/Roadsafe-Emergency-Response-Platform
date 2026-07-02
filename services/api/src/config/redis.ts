import Redis from 'ioredis'
import { env } from './env'
import { logger } from './logger'

let redisClient: Redis | null = null

function createRedisClient(): Redis | null {
  if (!env.REDIS_URL) {
    logger.info('Redis disabled (REDIS_URL not configured)')
    return null
  }

  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 3000,
    commandTimeout: 2000,

    // Stop reconnecting forever
    retryStrategy() {
      return null
    },
  })

  client.on('connect', () => {
    logger.info('✅ Redis connected')
  })

  // Ignore Redis errors in development
  client.on('error', () => {})

  client.connect().catch(() => {
    logger.info('Redis unavailable - continuing without Redis')
  })

  return client
}

const rawClient = createRedisClient()

export const redis = {
  get: async (key: string): Promise<string | null> => {
    try {
      return rawClient ? await rawClient.get(key) : null
    } catch {
      return null
    }
  },

  set: async (key: string, value: string): Promise<void> => {
    try {
      if (rawClient) await rawClient.set(key, value)
    } catch {}
  },

  setex: async (key: string, seconds: number, value: string): Promise<void> => {
    try {
      if (rawClient) await rawClient.setex(key, seconds, value)
    } catch {}
  },

  del: async (key: string): Promise<void> => {
    try {
      if (rawClient) await rawClient.del(key)
    } catch {}
  },

  ping: async (): Promise<string> => {
    try {
      return rawClient ? await rawClient.ping() : 'DISABLED'
    } catch {
      return 'ERROR'
    }
  },

  disconnect: () => {
    try {
      rawClient?.disconnect()
    } catch {}
  },
}