import { prisma } from '../config/database'

/**
 * Generate human-readable incident ID: RSEMG-2025-001234
 * Sequential per year, zero-padded to 6 digits.
 */
export async function generateIncidentId(): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = `RSEMG-${year}-`

  // Count events this year to get sequence
  const count = await prisma.emergencyEvent.count({
    where: {
      incidentId: { startsWith: prefix },
    },
  })

  const seq = String(count + 1).padStart(6, '0')
  return `${prefix}${seq}`
}

/**
 * Generate a secure random share token for family tracking URLs
 */
export function generateShareToken(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 20 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
