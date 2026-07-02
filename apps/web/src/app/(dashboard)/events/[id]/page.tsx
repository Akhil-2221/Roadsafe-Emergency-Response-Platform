'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { emergencyApi } from '@/lib/api'
import { formatDateTime, STATUS_CONFIG, SEVERITY_CONFIG } from '@/lib/utils'
import { Card, CardContent, Badge, Spinner, Alert, Button } from '@/components/ui/index'
import { StaticMap, DirectionsMap } from '@/components/maps/MapComponents'

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [confirmingOk, setConfirmingOk] = useState(false)

  useEffect(() => {
    emergencyApi.getStatus(id).then(r => setEvent(r.data.data)).finally(() => setLoading(false))
  }, [id])

  const handleOk = async () => {
    setConfirmingOk(true)
    try { await emergencyApi.confirmOk(id); router.refresh() }
    finally { setConfirmingOk(false) }
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>
  if (!event) return <Alert variant="danger">Event not found</Alert>

  const status = STATUS_CONFIG[event.status as keyof typeof STATUS_CONFIG]
  const severity = event.aiSeverity ? SEVERITY_CONFIG[event.aiSeverity as keyof typeof SEVERITY_CONFIG] : null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-muted-foreground hover:text-foreground">← Back</button>
        <h1 className="text-2xl font-black text-gray-900">Emergency Event</h1>
      </div>

      {/* Status header */}
      <Card className={severity ? 'border-red-200' : ''}>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${status?.color}`}>{status?.label}</span>
                {severity && <span className={`px-3 py-1 rounded-full text-sm font-bold ${severity.color}`}>{severity.icon} {severity.label}</span>}
              </div>
              <p className="text-muted-foreground text-sm mt-1">{formatDateTime(event.createdAt)}</p>
              <p className="font-bold mt-1">{event.qrCode?.vehicle?.vehicleNumber}</p>
            </div>
            {event.status === 'ACTIVE' && !event.ownerAckedOk && (
              <Button variant="outline" onClick={handleOk} loading={confirmingOk}
                className="border-green-500 text-green-600 hover:bg-green-50">
                ✅ I'm Safe — Cancel Alert
              </Button>
            )}
          </div>

          {event.aiVerdictReason && (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl">
              <p className="text-xs font-semibold text-gray-500 mb-1">AI Analysis</p>
              <p className="text-sm text-gray-700">{event.aiVerdictReason}</p>
              {event.aiVerdictScore && (
                <p className="text-xs text-muted-foreground mt-1">Confidence: {Math.round(event.aiVerdictScore * 100)}%</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location */}
      {event.latitude && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-3">📍 Accident Location</h2>
            <StaticMap latitude={event.latitude} longitude={event.longitude} height="200px" label="Accident scene" />
            <p className="text-xs text-muted-foreground mt-2">{event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}</p>
            <a href={`https://maps.google.com/?q=${event.latitude},${event.longitude}`} target="_blank"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-semibold hover:bg-blue-100 transition mt-2">
              🗺️ Open in Google Maps
            </a>
          </CardContent>
        </Card>
      )}

      {/* Hospital */}
      {event.hospital && (
        <Card className="border-blue-100">
          <CardContent className="pt-5">
            <h2 className="font-bold mb-3">🏥 Recommended Hospital</h2>
            <p className="font-bold text-lg text-gray-900">{event.hospital.name}</p>
            <p className="text-sm text-muted-foreground">{event.hospital.address}</p>
            {event.hospitalEtaMinutes && <p className="text-orange-600 font-semibold mt-1">ETA: ~{event.hospitalEtaMinutes} min</p>}
            {event.hospital.latitude && event.latitude && (
              <div className="mt-3">
                <DirectionsMap
                  fromLat={event.latitude}
                  fromLng={event.longitude}
                  toLat={event.hospital.latitude}
                  toLng={event.hospital.longitude}
                  height="200px"
                />
              </div>
            )}
            <div className="flex gap-3 mt-3 flex-wrap">
              {event.hospital.emergencyPhone && (
                <a href={`tel:${event.hospital.emergencyPhone}`}
                  className="px-4 py-2 bg-green-50 text-green-700 rounded-xl text-sm font-semibold">
                  📞 {event.hospital.emergencyPhone}
                </a>
              )}
              {event.hospitalRouteUrl && (
                <a href={event.hospitalRouteUrl} target="_blank"
                  className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-semibold">
                  🗺️ Get Directions
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI recommended actions */}
      {event.aiRecommendedActions?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-3">⚡ Recommended Actions</h2>
            <ul className="space-y-2">
              {event.aiRecommendedActions.map((a: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-red-500 mt-0.5 flex-shrink-0">→</span> {a}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Notifications */}
      {event.notifications?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-3">📱 Notifications Sent</h2>
            <div className="space-y-2">
              {event.notifications.map((n: any) => (
                <div key={n.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold">{n.contactName}</p>
                    <p className="text-xs text-muted-foreground">{n.channel}</p>
                  </div>
                  <Badge variant={n.status === 'SENT' || n.status === 'DELIVERED' ? 'success' : n.status === 'FAILED' ? 'danger' : 'muted'}>
                    {n.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {event.timeline?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-4">📋 Timeline</h2>
            <div className="space-y-4">
              {event.timeline.map((entry: any, i: number) => (
                <div key={entry.id} className="flex gap-4">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-3 h-3 rounded-full bg-red-500 mt-0.5" />
                    {i < event.timeline.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[20px]" />}
                  </div>
                  <div className="pb-3">
                    <p className="text-sm font-semibold text-gray-900">{entry.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(entry.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
