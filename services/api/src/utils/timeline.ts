import { prisma } from '../config/database'
import { logger } from '../config/logger'

export async function addTimelineEntry(
  emergencyEventId: string,
  action: string,
  description: string,
  metadata?: object
) {
  try {
    await prisma.timelineEntry.create({
      data: { emergencyEventId, action, description, metadata: metadata as any },
    })
  } catch (err) {
    logger.error('Timeline entry failed', { emergencyEventId, action, err })
  }
}
