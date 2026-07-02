'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { emergencyApi, hospitalApi } from '@/lib/api'
import { StaticMap, DirectionsMap } from '@/components/maps/MapComponents'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; label: string; icon: string; border: string }> = {
  CRITICAL: { bg: 'bg-red-600',    text: 'text-white',     label: 'CRITICAL', icon: '🚨', border: 'border-red-600' },
  HIGH:     { bg: 'bg-orange-500', text: 'text-white',     label: 'HIGH',     icon: '🔴', border: 'border-orange-500' },
  MEDIUM:   { bg: 'bg-yellow-400', text: 'text-gray-900',  label: 'MEDIUM',   icon: '🟡', border: 'border-yellow-400' },
  LOW:      { bg: 'bg-green-500',  text: 'text-white',     label: 'LOW',      icon: '🟢', border: 'border-green-500' },
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING:            { label: 'Reported',        color: 'bg-gray-100 text-gray-700' },
  EVIDENCE_COLLECTED: { label: 'Evidence Gathered', color: 'bg-blue-100 text-blue-700' },
  AI_VERIFYING:       { label: 'AI Analyzing',    color: 'bg-purple-100 text-purple-700' },
  VERIFIED:           { label: 'Verified',        color: 'bg-orange-100 text-orange-700' },
  ACTIVE:             { label: '🔴 ACTIVE',       color: 'bg-red-100 text-red-700' },
  RESOLVED:           { label: '✅ Resolved — Safe', color: 'bg-green-100 text-green-700' },
  FALSE_ALARM:        { label: 'False Alarm',     color: 'bg-gray-100 text-gray-500' },
  CANCELLED:          { label: 'Cancelled',       color: 'bg-gray-100 text-gray-500' },
}

export default function FamilyTrackingPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const [eventData, setEventData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMedical, setShowMedical] = useState(false)
  const [medical, setMedical] = useState<any>(null)
  const [loadingMedical, setLoadingMedical] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [policeStations, setPoliceStations] = useState<any[]>([])
  const sseRef = useRef<EventSource | null>(null)

  // ─── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!shareToken) return

    const fetchData = async () => {
      try {
        const { data } = await emergencyApi.getByShareToken(shareToken)
        setEventData(data.data)
        setLoading(false)
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Emergency not found. This link may have expired.')
        setLoading(false)
      }
    }

    fetchData()
  }, [shareToken])

  // ─── Nearby police stations (for FIR filing guidance) ───────────
  useEffect(() => {
    if (!eventData?.latitude || !eventData?.longitude) return
    hospitalApi.policeNearby(eventData.latitude, eventData.longitude)
      .then(({ data }) => setPoliceStations(data?.data?.stations || []))
      .catch(() => setPoliceStations([])) // silently skip — optional enhancement, not critical path
  }, [eventData?.latitude, eventData?.longitude])

  // ─── SSE real-time updates ──────────────────────────────────────
  useEffect(() => {
    if (!eventData?.id || loading) return

    const url = `${API_URL}/api/emergency/${eventData.id}/status/stream`
    const es = new EventSource(url)
    sseRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'status' && msg.data) {
          setEventData(msg.data)
          setLastUpdate(new Date())
        }
      } catch {}
    }

    es.onerror = () => {
      es.close()
      // Fall back to polling every 10s
      const iv = setInterval(async () => {
        try {
          const { data } = await emergencyApi.getByShareToken(shareToken)
          setEventData(data.data)
          setLastUpdate(new Date())
          if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(data.data.status)) clearInterval(iv)
        } catch {}
      }, 10000)
    }

    return () => { sseRef.current?.close() }
  }, [eventData?.id, loading])

  // ─── Load medical passport ──────────────────────────────────────
  const handleViewMedical = async () => {
    if (medical) { setShowMedical(true); return }
    setLoadingMedical(true)
    try {
      const { data } = await emergencyApi.getMedicalByShareToken(shareToken)
      setMedical(data.data)
      setShowMedical(true)
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Medical passport not available yet. Available only after accident verification.')
    } finally {
      setLoadingMedical(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 text-sm">Loading emergency details…</p>
    </div>
  )

  if (error) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-black text-gray-900 mb-2">Not Found</h2>
      <p className="text-gray-500 text-sm">{error}</p>
      <a href="tel:112" className="mt-6 block w-full max-w-xs py-4 bg-red-600 text-white font-black rounded-2xl text-center">
        📞 Call 112
      </a>
    </div>
  )

  if (!eventData) return null

  const sev = eventData.aiSeverity
  const sevStyle = sev ? SEVERITY_CONFIG[sev] : null
  const statusInfo = STATUS_LABELS[eventData.status] || { label: eventData.status, color: 'bg-gray-100 text-gray-700' }
  const isTerminal = ['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(eventData.status)
  const isResolved = eventData.status === 'RESOLVED'

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className={`${sevStyle?.bg || 'bg-red-600'} px-5 py-6 ${sevStyle?.text || 'text-white'}`}>
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-70 font-semibold">RoadSafe Emergency</p>
              <h1 className="text-2xl font-black">
                {isResolved ? '✅ Victim Safe' : sevStyle ? `${sevStyle.icon} ${sevStyle.label} SEVERITY` : '🚨 Emergency Active'}
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs opacity-60">Incident ID</p>
              <p className="font-black text-sm tracking-wider">{eventData.incidentId}</p>
            </div>
          </div>

          {/* Status badge */}
          <span className="inline-block px-3 py-1 bg-white/20 rounded-full text-xs font-bold">
            {statusInfo.label}
          </span>

          {/* Last update */}
          {!isTerminal && (
            <p className="text-xs opacity-60 mt-2">
              🔄 Live • Updated {lastUpdate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 mt-4 space-y-4">

        {/* RESOLVED Banner */}
        {isResolved && (
          <div className="bg-green-50 border-2 border-green-500 rounded-2xl p-5 text-center">
            <div className="text-4xl mb-2">✅</div>
            <h2 className="text-xl font-black text-green-800">Victim Confirmed Safe</h2>
            <p className="text-green-700 text-sm mt-1">
              {eventData.victimName} confirmed they are safe via the RoadSafe app.
            </p>
          </div>
        )}

        {/* Call 112 */}
        {!isTerminal && (
          <a href="tel:112" className="block w-full py-4 bg-red-600 text-white font-black text-xl rounded-2xl text-center shadow-lg">
            📞 Call 112 — National Emergency
          </a>
        )}

        {/* Victim + Vehicle Info */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Victim & Vehicle</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Victim Name</span>
              <span className="font-bold text-gray-900">{eventData.victimName || '—'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Vehicle</span>
              <span className="font-black text-gray-900 tracking-wider">{eventData.vehicleNumber}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Reported</span>
              <span className="text-sm font-medium text-gray-700">
                {new Date(eventData.createdAt).toLocaleString('en-IN', {
                  timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short'
                })}
              </span>
            </div>
            {eventData.accessMethod && eventData.accessMethod !== 'QR_SCAN' && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Reported via</span>
                <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded-full">
                  {eventData.accessMethod === 'PLATE_SEARCH' ? '🔍 Number Plate Search' : '📱 Mobile Search'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Bystander info */}
        {(eventData.bystanderName || eventData.bystanderPhone) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-blue-50 px-4 py-3 border-b border-blue-100">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Bystander at Scene</p>
            </div>
            <div className="p-4 space-y-3">
              {eventData.bystanderName && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Name</span>
                  <span className="font-bold text-gray-900">{eventData.bystanderName}</span>
                </div>
              )}
              {eventData.bystanderPhone && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-500">Mobile</span>
                  <a href={`tel:${eventData.bystanderPhone}`}
                    className="font-bold text-blue-600 underline">
                    {eventData.bystanderPhone}
                  </a>
                </div>
              )}
              {eventData.bystanderPhone && (
                <a href={`tel:${eventData.bystanderPhone}`}
                  className="block w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-center text-sm mt-2">
                  📞 Call Bystander for Updates
                </a>
              )}
            </div>
          </div>
        )}

        {/* Live location */}
        {eventData.latitude && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">📍 Accident Location</p>
              {!isTerminal && <span className="text-xs text-green-600 font-semibold animate-pulse">● Live</span>}
            </div>
            <div className="p-0">
              <StaticMap
                latitude={eventData.latitude}
                longitude={eventData.longitude}
                height="220px"
                label="Accident location"
              />
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-2">
                <a href={`https://maps.google.com/?q=${eventData.latitude},${eventData.longitude}`}
                  target="_blank" rel="noopener noreferrer"
                  className="py-3 bg-blue-50 text-blue-700 font-bold rounded-xl text-center text-sm">
                  🗺️ Open in Maps
                </a>
                <a href={`https://maps.google.com/maps/dir/?api=1&destination=${eventData.latitude},${eventData.longitude}&travelmode=driving`}
                  target="_blank" rel="noopener noreferrer"
                  className="py-3 bg-green-50 text-green-700 font-bold rounded-xl text-center text-sm">
                  🧭 Navigate Here
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Hospital recommendation */}
        {eventData.hospital && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">🏥 Recommended Hospital</p>
            </div>
            <div className="p-4">
              <p className="font-black text-gray-900 text-lg">{eventData.hospital.name}</p>
              <p className="text-gray-500 text-sm mt-1">{eventData.hospital.address}</p>
              {eventData.hospitalEtaMinutes && (
                <div className="flex gap-2 mt-2">
                  <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full">
                    ⏱ ETA ~{eventData.hospitalEtaMinutes} min
                  </span>
                  {eventData.hospital.hasTraumaCenter && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">🏥 Trauma</span>
                  )}
                  {eventData.hospital.hasICU && (
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">🫀 ICU</span>
                  )}
                  {eventData.hospital.hasBloodBank && (
                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded-full">🩸 Blood Bank</span>
                  )}
                </div>
              )}

              {/* Directions map */}
              {eventData.hospital.latitude && eventData.latitude && (
                <div className="mt-3 rounded-xl overflow-hidden">
                  <DirectionsMap
                    fromLat={eventData.latitude}
                    fromLng={eventData.longitude}
                    toLat={eventData.hospital.latitude}
                    toLng={eventData.hospital.longitude}
                    height="180px"
                  />
                </div>
              )}

              <div className="flex gap-2 mt-3">
                {eventData.hospital.emergencyPhone && (
                  <a href={`tel:${eventData.hospital.emergencyPhone}`}
                    className="flex-1 py-3 bg-green-50 text-green-700 font-bold rounded-xl text-center text-sm border border-green-200">
                    📞 Call Hospital ER
                  </a>
                )}
                {eventData.hospitalRouteUrl && (
                  <a href={eventData.hospitalRouteUrl} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl text-center text-sm border border-blue-200">
                    🧭 Get Directions
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Nearby police stations — for FIR filing guidance */}
        {policeStations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">🚓 Nearby Police Stations</p>
              <p className="text-xs text-gray-400 mt-0.5">For filing an accident FIR</p>
            </div>
            <div className="p-4 space-y-2">
              {policeStations.slice(0, 3).map((station: any) => (
                <a
                  key={station.placeId}
                  href={station.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-3 py-2 px-3 rounded-xl hover:bg-gray-50 transition"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{station.name}</p>
                    <p className="text-xs text-gray-400 truncate">{station.address}</p>
                  </div>
                  {typeof station.distanceKm === 'number' && (
                    <span className="text-xs font-bold text-gray-500 flex-shrink-0">{station.distanceKm} km</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* AI Severity info */}
        {eventData.aiSeverity && (
          <div className={`rounded-2xl p-4 border-2 ${sevStyle?.border || 'border-red-600'}`}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">⚡ Severity Assessment</p>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1.5 rounded-xl font-black text-sm ${sevStyle?.bg} ${sevStyle?.text}`}>
                {sevStyle?.icon} {sevStyle?.label}
              </span>
              <span className="text-sm text-gray-600">{Math.round((eventData.aiVerdictScore || 0.5) * 100)}% confidence</span>
            </div>
            {eventData.aiSeverityReason && (
              <p className="text-sm text-gray-600 mt-2">{eventData.aiSeverityReason}</p>
            )}
          </div>
        )}

        {/* Medical passport access */}
        {['VERIFIED', 'ACTIVE', 'RESOLVED'].includes(eventData.status) && (
          <div className="bg-white rounded-2xl shadow-sm border border-purple-200 overflow-hidden">
            <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
              <p className="text-xs font-bold text-purple-600 uppercase tracking-widest">🩺 Medical Passport</p>
              <p className="text-xs text-purple-500 mt-0.5">For first responders and hospital staff</p>
            </div>
            <div className="p-4">
              {showMedical && medical ? (
                <MedicalPassportCard medical={medical} />
              ) : (
                <button
                  onClick={handleViewMedical}
                  disabled={loadingMedical}
                  className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl text-center text-sm disabled:opacity-50">
                  {loadingMedical ? '🔄 Loading…' : '🩺 View Medical Information'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Timeline */}
        {eventData.timeline && eventData.timeline.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">📋 Emergency Timeline</p>
            </div>
            <div className="p-4">
              <div className="space-y-3">
                {eventData.timeline.map((entry: any, i: number) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0 mt-0.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-red-500' : 'bg-gray-300'}`} />
                      {i < eventData.timeline.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[16px]" />}
                    </div>
                    <div className="pb-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-snug">{entry.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(entry.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-gray-400">
            This is a live emergency tracking page • RoadSafe Emergency Platform
          </p>
          <p className="text-xs text-gray-400 mt-1">Incident ID: {eventData.incidentId}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Medical Passport Card Component ────────────────────────────
function MedicalPassportCard({ medical }: { medical: any }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 rounded-xl p-3">
          <p className="text-xs text-red-600 font-semibold">Blood Group</p>
          <p className="text-2xl font-black text-red-700 mt-1">{medical.bloodGroup || 'Unknown'}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3">
          <p className="text-xs text-green-600 font-semibold">Organ Donor</p>
          <p className="text-lg font-black text-green-700 mt-1">{medical.organDonor ? '✅ Yes' : '❌ No'}</p>
        </div>
      </div>

      {medical.allergies?.length > 0 && (
        <div className="bg-orange-50 rounded-xl p-3">
          <p className="text-xs text-orange-600 font-semibold mb-2">⚠️ ALLERGIES</p>
          <div className="flex flex-wrap gap-1.5">
            {medical.allergies.map((a: string) => (
              <span key={a} className="bg-orange-200 text-orange-800 text-xs font-bold px-2 py-1 rounded-full">{a}</span>
            ))}
          </div>
        </div>
      )}

      {medical.chronicConditions?.length > 0 && (
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-xs text-blue-600 font-semibold mb-2">🏥 CONDITIONS</p>
          <div className="flex flex-wrap gap-1.5">
            {medical.chronicConditions.map((c: string) => (
              <span key={c} className="bg-blue-200 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">{c}</span>
            ))}
          </div>
        </div>
      )}

      {medical.currentMedications?.length > 0 && (
        <div className="bg-purple-50 rounded-xl p-3">
          <p className="text-xs text-purple-600 font-semibold mb-2">💊 MEDICATIONS</p>
          <div className="flex flex-wrap gap-1.5">
            {medical.currentMedications.map((m: string) => (
              <span key={m} className="bg-purple-200 text-purple-800 text-xs font-bold px-2 py-1 rounded-full">{m}</span>
            ))}
          </div>
        </div>
      )}

      {medical.medicalNotes && (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-xs text-gray-500 font-semibold mb-1">📝 NOTES</p>
          <p className="text-sm text-gray-700">{medical.medicalNotes}</p>
        </div>
      )}

      <p className="text-xs text-center text-gray-400 pt-1">
        Accessed: {new Date(medical.accessedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </p>
    </div>
  )
}
