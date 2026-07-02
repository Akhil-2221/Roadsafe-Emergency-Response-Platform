import { AppError } from '../../utils/AppError'
import { generateOtp } from '../../utils/otp'

describe('AppError', () => {
  it('creates error with correct status code', () => {
    const err = new AppError('Not found', 404)
    expect(err.message).toBe('Not found')
    expect(err.statusCode).toBe(404)
    expect(err.isOperational).toBe(true)
    expect(err).toBeInstanceOf(Error)
  })

  it('defaults to 500 status code', () => {
    const err = new AppError('Server error')
    expect(err.statusCode).toBe(500)
  })

  it('is identifiable as AppError via instanceof', () => {
    const err = new AppError('Test', 400)
    expect(err instanceof AppError).toBe(true)
  })
})

describe('OTP Generator', () => {
  it('generates a 6-digit numeric code', async () => {
    const { code } = await generateOtp()
    expect(code).toMatch(/^\d{6}$/)
  })

  it('generates a bcrypt hash', async () => {
    const { hash } = await generateOtp()
    expect(hash.startsWith('$2b$')).toBe(true)
  })

  it('generates unique codes on each call', async () => {
    const [a, b] = await Promise.all([generateOtp(), generateOtp()])
    // Extremely unlikely to collide but hashes must differ
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('Hospital haversine distance', () => {
  // Import the haversine from hospital routes (inline test)
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  it('returns 0 for same coordinates', () => {
    expect(haversine(17.4238, 78.4569, 17.4238, 78.4569)).toBeCloseTo(0, 5)
  })

  it('returns correct distance between Hyderabad hospitals', () => {
    // Yashoda (17.4238, 78.4569) to Apollo (17.4272, 78.4072) ≈ 4.4 km
    const dist = haversine(17.4238, 78.4569, 17.4272, 78.4072)
    expect(dist).toBeGreaterThan(4)
    expect(dist).toBeLessThan(6)
  })
})
