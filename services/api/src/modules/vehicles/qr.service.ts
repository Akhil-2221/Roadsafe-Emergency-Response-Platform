import jwt from 'jsonwebtoken'
import QRCode from 'qrcode'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { uploadToS3 } from '../../utils/storage'
import { AppError } from '../../utils/AppError'

const QR_BASE_URL = `${env.APP_URL}/emergency`

export async function generateQrForVehicle(vehicleId: string, userId: string) {
  // Ownership check
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId, userId },
    include: { qrCode: true },
  })
  if (!vehicle) throw new AppError('Vehicle not found', 404)

  // Deactivate existing QR if any
  if (vehicle.qrCode) {
    await prisma.qrCode.update({
      where: { id: vehicle.qrCode.id },
      data: { isActive: false },
    })
  }

  // Sign a JWT token — payload is minimal (just vehicleId + issued time)
  // The QR never directly exposes user data
  const token = jwt.sign(
    { vid: vehicleId, iat: Math.floor(Date.now() / 1000) },
    env.QR_JWT_SECRET,
    { noTimestamp: false } // JWT issued-at is included
    // NO expiry — emergency QR should never expire
  )

  // Generate QR image
  const qrUrl = `${QR_BASE_URL}/${token}`
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    errorCorrectionLevel: 'H', // High — survives damage
    type: 'png',
    width: 600,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const s3Key = `qr/${vehicleId}/emergency-qr-${Date.now()}.png`
  const qrImageUrl = await uploadToS3(qrBuffer, s3Key, 'image/png')

let qrCode

if (vehicle.qrCode) {
  qrCode = await prisma.qrCode.update({
    where: { id: vehicle.qrCode.id },
    data: {
      token,
      qrImageUrl,
      isActive: true,
    },
  })
} else {
  qrCode = await prisma.qrCode.create({
    data: {
      vehicleId,
      token,
      qrImageUrl,
      isActive: true,
    },
  })
}

  return { qrCode, qrUrl, qrImageUrl }
}

export async function generateParkingQr(vehicleId: string, userId: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId, userId },
    include: { parkingQr: true },
  })
  if (!vehicle) throw new AppError('Vehicle not found', 404)

  if (vehicle.parkingQr) {
    await prisma.parkingQr.update({ where: { id: vehicle.parkingQr.id }, data: { isActive: false } })
  }

  const token = jwt.sign({ vid: vehicleId, type: 'parking' }, env.QR_JWT_SECRET)

  const qrUrl = `${env.APP_URL}/parking/${token}`
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    errorCorrectionLevel: 'H',
    type: 'png',
    width: 400,
    margin: 2,
  })

  const s3Key = `qr/${vehicleId}/parking-qr-${Date.now()}.png`
  const qrImageUrl = await uploadToS3(qrBuffer, s3Key, 'image/png')
let parkingQr

if (vehicle.parkingQr) {
  parkingQr = await prisma.parkingQr.update({
    where: { id: vehicle.parkingQr.id },
    data: {
      token,
      qrImageUrl,
      isActive: true,
    },
  })
} else {
  parkingQr = await prisma.parkingQr.create({
    data: {
      vehicleId,
      token,
      qrImageUrl,
      isActive: true,
    },
  })
}
  return { parkingQr, qrUrl, qrImageUrl }
}

export async function verifyQrToken(token: string): Promise<{ vehicleId: string; type: string }> {
  try {
    const payload = jwt.verify(token, env.QR_JWT_SECRET) as any
    return { vehicleId: payload.vid, type: payload.type ?? 'emergency' }
  } catch {
    throw new AppError('Invalid QR code', 400)
  }
}
