import { env } from '../config/env'
import { logger } from '../config/logger'

export interface LatLng {
  lat: number
  lng: number
}

export interface NearbyPlace {
  name: string
  address: string
  distanceKm?: number
  phone?: string
  placeId: string
  location: LatLng
  mapsUrl: string
  rating?: number
}

/**
 * Build a simple Google Maps "view location" URL — used in SMS/email alerts.
 */
export function buildMapsUrl(lat: number, lng: number, label?: string): string {
  const query = label ? encodeURIComponent(label) : `${lat},${lng}`
  return `https://www.google.com/maps?q=${lat},${lng}&label=${query}`
}

/**
 * Build a turn-by-turn navigation URL (Google Maps directions, driving mode).
 */
export function buildNavigationUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

/**
 * Build a navigation URL with both origin and destination (used for hospital routing).
 */
export function buildDirectionsUrl(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${fromLat},${fromLng}&destination=${toLat},${toLng}&travelmode=driving`
}

/**
 * Fetch nearby hospitals from Google Places API (Nearby Search).
 * Falls back to empty array if no API key configured — caller should fall back
 * to the database-driven hospital recommendation in that case.
 */
export async function getNearbyHospitalsFromGoogle(
  lat: number,
  lng: number,
  radiusMeters = 8000
): Promise<NearbyPlace[]> {
  return fetchNearbyPlaces(lat, lng, 'hospital', radiusMeters)
}

/**
 * Fetch nearby police stations from Google Places API — useful for accident
 * reports / FIR filing guidance shown to bystanders and family.
 */
export async function getNearbyPolice(
  lat: number,
  lng: number,
  radiusMeters = 8000
): Promise<NearbyPlace[]> {
  return fetchNearbyPlaces(lat, lng, 'police', radiusMeters)
}

async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  type: string,
  radius: number
): Promise<NearbyPlace[]> {
  const apiKey = env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    logger.warn(`Google Maps API key not configured — skipping live ${type} search`)
    return []
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radius}&type=${type}&key=${apiKey}`

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data: any = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      logger.warn('Google Places API non-OK status', { status: data.status, type })
      return []
    }

    return (data.results || []).slice(0, 6).map((place: any) => ({
      name: place.name,
      address: place.vicinity || '',
      placeId: place.place_id,
      location: {
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
      },
      mapsUrl: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      rating: place.rating,
      distanceKm: haversineKm(lat, lng, place.geometry?.location?.lat, place.geometry?.location?.lng),
    })).sort((a: NearbyPlace, b: NearbyPlace) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
  } catch (err: any) {
    logger.error('Google Places fetch failed', { type, error: err.message })
    return []
  }
}

/**
 * Reverse geocode GPS coordinates to a human-readable address.
 * Falls back to raw coordinates if no API key or request fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const apiKey = env.GOOGLE_MAPS_API_KEY
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

  if (!apiKey) return fallback

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const data: any = await res.json()
    if (data.results?.[0]?.formatted_address) return data.results[0].formatted_address
    return fallback
  } catch (err) {
    logger.warn('Reverse geocode failed, using raw coordinates', { lat, lng })
    return fallback
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if ([lat1, lon1, lat2, lon2].some(v => typeof v !== 'number' || isNaN(v))) return 0
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}
