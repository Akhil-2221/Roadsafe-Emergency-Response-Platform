'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { emergencyApi } from '@/lib/api'
import { formatDateTime, STATUS_CONFIG, SEVERITY_CONFIG } from '@/lib/utils'
import { Card, CardContent, Badge, Spinner, EmptyState, Button } from '@/components/ui/index'

export default function EventsPage() {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    emergencyApi.myEvents().then(r => setEvents(r.data.data.events)).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Emergency History</h1>
        <p className="text-muted-foreground text-sm mt-1">All emergency events linked to your vehicles.</p>
      </div>

      {events.length === 0 ? (
        <Card>
          <EmptyState icon="🛡️" title="No emergency events" description="You haven't had any emergency events. Stay safe!" />
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((ev: any) => {
            const status = STATUS_CONFIG[ev.status as keyof typeof STATUS_CONFIG]
            const severity = ev.aiSeverity ? SEVERITY_CONFIG[ev.aiSeverity as keyof typeof SEVERITY_CONFIG] : null
            return (
              <Link key={ev.id} href={`/events/${ev.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${severity ? 'bg-red-50' : 'bg-gray-50'}`}>
                          {severity?.icon || '🚨'}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{ev.qrCode?.vehicle?.vehicleNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
                          {ev.hospital && <p className="text-xs text-blue-600 mt-0.5">🏥 {ev.hospital.name}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${status?.color}`}>{status?.label}</span>
                        {severity && <Badge variant="danger" className="text-xs">{severity.label}</Badge>}
                      </div>
                    </div>

                    {/* Mini timeline preview */}
                    {ev.timeline && ev.timeline.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-50">
                        <p className="text-xs text-muted-foreground">
                          {ev.timeline.length} timeline event{ev.timeline.length !== 1 ? 's' : ''} ·{' '}
                          Last: {ev.timeline[ev.timeline.length - 1]?.description}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
