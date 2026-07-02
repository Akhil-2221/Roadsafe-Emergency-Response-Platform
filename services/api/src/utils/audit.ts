import { prisma } from '../config/database'
import { logger } from '../config/logger'

export async function auditLog(
  userId: string | null,
  action: string,
  resource: string,
  resourceId?: string,
  ipAddress?: string,
  metadata?: object
) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, resource, resourceId, ipAddress, metadata: metadata as any },
    })
  } catch (err) {
    // Audit logging should never break the main flow
    logger.error('Audit log failed', { action, resource, err })
  }
}
