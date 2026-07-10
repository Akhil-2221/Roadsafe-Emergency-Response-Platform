import sgMail from '@sendgrid/mail'
import { env } from '../config/env'
import { logger } from '../config/logger'

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

if (env.SENDGRID_API_KEY) {
  sgMail.setApiKey(env.SENDGRID_API_KEY)
} else {
  logger.warn('SendGrid not configured — emails will be logged only')
}

// export async function sendEmail(options: EmailOptions): Promise<void> {
//   if (!env.SENDGRID_API_KEY) {
//     logger.info('[EMAIL MOCK]', {
//       to: options.to,
//       subject: options.subject,
//     })
//     return
//   }

//   try {
//     await sgMail.send({
//       to: options.to,
//       from: {
//         email: env.SENDGRID_FROM_EMAIL,
//         name: env.SENDGRID_FROM_NAME,
//       },
//       subject: options.subject,
//       html: options.html,
//       text: options.text,
//     })

//     logger.info('Email sent', {
//       to: options.to,
//       subject: options.subject,
//     })
//   } catch (err: any) {
//     logger.error('SendGrid email failed', {
//       message: err.message,
//       response: err.response?.body,
//     })
//     throw err
//   }
// }
export async function sendEmail(options: EmailOptions): Promise<void> {
  if (!env.SENDGRID_API_KEY) {
    logger.info('[EMAIL MOCK]', {
      to: options.to,
      subject: options.subject,
    })
    return
  }

  try {
    await sgMail.send({
      to: options.to,
      from: {
        email: env.SENDGRID_FROM_EMAIL,
        name: env.SENDGRID_FROM_NAME,
      },
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    logger.info('Email sent', {
      to: options.to,
      subject: options.subject,
    })
  } catch (err: any) {
    logger.error('SendGrid email failed', {
      message: err.message,
      response: err.response?.body,
    })
    throw err
  }
}