import { env } from '../config/env'
import { logger } from '../config/logger'

let firebaseApp: any = null

function getFirebase() {
  if (!env.FIREBASE_SERVER_KEY) {
    return null
  }
  if (!firebaseApp) {
    try {
      const admin = require('firebase-admin')
      if (!admin.apps.length) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(env.FIREBASE_SERVER_KEY)),
        })
      } else {
        firebaseApp = admin.apps[0]
      }
    } catch (err) {
      logger.warn('Firebase init failed — push notifications disabled', { err })
      return null
    }
  }
  return firebaseApp
}

export interface PushPayload {
  title: string
  body: string
  data?: Record<string, string>
  imageUrl?: string
}

export async function sendPushNotification(
  fcmToken: string,
  payload: PushPayload
): Promise<void> {
  const app = getFirebase()
  if (!app) {
    logger.info('[PUSH MOCK]', { token: fcmToken.slice(0, 20) + '...', title: payload.title })
    return
  }

  const admin = require('firebase-admin')
  const message = {
    token: fcmToken,
    notification: {
      title: payload.title,
      body: payload.body,
      ...(payload.imageUrl ? { imageUrl: payload.imageUrl } : {}),
    },
    data: payload.data || {},
    android: {
      priority: 'high' as const,
      notification: {
        sound: 'emergency',
        channelId: 'emergency_alerts',
        priority: 'max' as const,
        defaultVibrateTimings: false,
        vibrateTimingsMillis: [0, 500, 250, 500],
      },
    },
    apns: {
      payload: {
        aps: {
          sound: 'emergency.caf',
          badge: 1,
          contentAvailable: true,
        },
      },
      headers: {
        'apns-priority': '10',
      },
    },
  }

  const response = await admin.messaging(app).send(message)
  logger.info('Push notification sent', { messageId: response, title: payload.title })
}

export async function sendPushToMultiple(
  fcmTokens: string[],
  payload: PushPayload
): Promise<void> {
  if (!fcmTokens.length) return

  await Promise.allSettled(
    fcmTokens.map(token => sendPushNotification(token, payload))
  )
}
