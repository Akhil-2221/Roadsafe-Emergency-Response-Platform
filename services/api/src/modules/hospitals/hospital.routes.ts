import { Router, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { asyncHandler } from '../../utils/asyncHandler'
import { AppError } from '../../utils/AppError'
import {
  getNearbyHospitalsFromGoogle,
  getNearbyPolice,
  reverseGeocode,
  buildNavigationUrl,
} from '../../utils/maps'

const router = Router()

// GET /api/hospitals/nearby?lat=&lng=&radius=
// Primary source: curated hospital database (capability-aware, used by AI recommendation)
router.get('/nearby', asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  const radiusKm = parseFloat(req.query.radius as string) || 30

  if (isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ success: false, message: 'lat and lng required' })
  }

  // Simple bounding box filter — good enough for nearby search
  // For production: use PostGIS or Haversine formula in raw SQL
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180))

  const hospitals = await prisma.hospital.findMany({
    where: {
      isActive: true,
      latitude: { gte: lat - latDelta, lte: lat + latDelta },
      longitude: { gte: lng - lngDelta, lte: lng + lngDelta },
    },
    orderBy: { rating: 'desc' },
    take: 10,
  })

  // Add distance to each
  const withDistance = hospitals.map(h => ({
    ...h,
    distanceKm: haversine(lat, lng, h.latitude, h.longitude),
  })).sort((a, b) => a.distanceKm - b.distanceKm)

  res.json({ success: true, data: { hospitals: withDistance } })
}))

// GET /api/hospitals/nearby-live?lat=&lng=
// Supplementary source: live Google Places search — useful outside curated cities,
// or as a richer fallback when the DB has no coverage for this location.
// Requires GOOGLE_MAPS_API_KEY; returns empty array gracefully if not configured.
router.get('/nearby-live', asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  if (isNaN(lat) || isNaN(lng)) throw new AppError('lat and lng are required', 400)

  const hospitals = await getNearbyHospitalsFromGoogle(lat, lng)
  res.json({ success: true, data: { hospitals } })
}))

// GET /api/hospitals/police/nearby?lat=&lng=
// Nearest police stations — shown to family/bystanders for FIR filing guidance.
router.get('/police/nearby', asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  if (isNaN(lat) || isNaN(lng)) throw new AppError('lat and lng are required', 400)

  const stations = await getNearbyPolice(lat, lng)
  res.json({ success: true, data: { stations } })
}))

// GET /api/hospitals/reverse-geocode?lat=&lng=
// Human-readable address for an accident location — used in notifications and timeline.
router.get('/reverse-geocode', asyncHandler(async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string)
  const lng = parseFloat(req.query.lng as string)
  if (isNaN(lat) || isNaN(lng)) throw new AppError('lat and lng are required', 400)

  const address = await reverseGeocode(lat, lng)
  res.json({
    success: true,
    data: { address, navigationUrl: buildNavigationUrl(lat, lng) },
  })
}))

// GET /api/hospitals/:id
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const hospital = await prisma.hospital.findUnique({ where: { id: req.params.id } })
  if (!hospital) return res.status(404).json({ success: false, message: 'Hospital not found' })
  res.json({ success: true, data: { hospital } })
}))

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export default router
