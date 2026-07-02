import { env } from '../config/env'
import { logger } from '../config/logger'

let twilioClient: any = null

function getTwilio() {
  if (!twilioClient) {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      logger.warn('Twilio not configured — SMS will be logged only')
      return null
    }
    const twilio = require('twilio')
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  }
  return twilioClient
}

export async function sendSms(to: string, body: string): Promise<void> {
  const client = getTwilio()
  if (!client) {
    logger.info('[SMS MOCK]', { to, body })
    return
  }
  const message = await client.messages.create({
    from: env.TWILIO_PHONE_NUMBER,
    to,
    body,
  })
  logger.info('SMS sent', { sid: message.sid, to })
}

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const client = getTwilio()
  if (!client) {
    logger.info('[WHATSAPP MOCK]', { to, body })
    return
  }
  const message = await client.messages.create({
    from: env.TWILIO_WHATSAPP_FROM,
    to: `whatsapp:${to}`,
    body,
  })
  logger.info('WhatsApp sent', { sid: message.sid, to })
}
