import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../config/env'
import { logger } from '../config/logger'
import * as fs from 'fs'
import * as path from 'path'

let s3Client: S3Client | null = null

function getS3() {
  if (!s3Client) {
    if (!env.AWS_ACCESS_KEY_ID || !env.S3_BUCKET) {
      return null
    }
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }
  return s3Client
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const client = getS3()

  if (!client || !env.S3_BUCKET) {
    // Dev fallback: save to local uploads dir
    const uploadsDir = path.join(process.cwd(), 'uploads')

logger.info('Current working directory', {
  cwd: process.cwd(),
})

logger.info('Uploads directory', {
  uploadsDir,
})

fs.mkdirSync(uploadsDir, { recursive: true })

const filename = key.replace(/\//g, '-')
const filePath = path.join(uploadsDir, filename)

fs.writeFileSync(filePath, buffer)

const url = `${env.APP_URL}/uploads/${filename}`

logger.info('[S3 MOCK] File saved locally', {
  url,
  filePath,
})

return url
  }

  await client.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))

  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`
}

export async function deleteFromS3(key: string): Promise<void> {
  const client = getS3()
  if (!client || !env.S3_BUCKET) return

  await client.send(new DeleteObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  }))
}
