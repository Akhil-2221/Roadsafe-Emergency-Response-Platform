'use client'
import { useEffect, useRef } from 'react'

interface MapProps {
  latitude: number
  longitude: number
  zoom?: number
  label?: string
  height?: string
}

declare global {
  interface Window { google: any; initMap: () => void }
}

export function StaticMap({ latitude, longitude, zoom = 15, label, height = '200px' }: MapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY

  // Fallback: OpenStreetMap iframe (no API key needed)
  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}&layer=mapnik&marker=${latitude},${longitude}`
  const googleMapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height }}>
      <iframe
        src={osmUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        title={label || 'Accident location'}
      />
      <div className="absolute bottom-2 right-2">
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg shadow text-xs font-semibold text-blue-600 hover:bg-blue-50 transition"
        >
          Open in Google Maps →
        </a>
      </div>
    </div>
  )
}

interface DirectionsMapProps {
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
  height?: string
}

export function DirectionsMap({ fromLat, fromLng, toLat, toLng, height = '250px' }: DirectionsMapProps) {
  const osmUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${Math.min(fromLng, toLng) - 0.02},${Math.min(fromLat, toLat) - 0.02},${Math.max(fromLng, toLng) + 0.02},${Math.max(fromLat, toLat) + 0.02}&layer=mapnik`
  const googleDirectionsUrl = `https://maps.google.com/maps/dir/${fromLat},${fromLng}/${toLat},${toLng}`

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 relative" style={{ height }}>
      <iframe
        src={osmUrl}
        width="100%"
        height="100%"
        style={{ border: 0 }}
        loading="lazy"
        title="Route to hospital"
      />
      <div className="absolute bottom-2 right-2">
        <a
          href={googleDirectionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-white rounded-lg shadow text-xs font-semibold text-green-600 hover:bg-green-50 transition"
        >
          🗺️ Get Directions
        </a>
      </div>
    </div>
  )
}

// GPS location hook
export function useGeoLocation() {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

// Continuous location tracking
export function useLocationTracking(
  onUpdate: (lat: number, lng: number, accuracy: number) => void,
  active: boolean
): () => void {
  if (!active || typeof navigator === 'undefined') return () => {}

  const watchId = navigator.geolocation.watchPosition(
    (pos) => onUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => console.warn('Location tracking error:', err),
    { enableHighAccuracy: true, maximumAge: 5000 }
  )

  return () => navigator.geolocation.clearWatch(watchId)
}
