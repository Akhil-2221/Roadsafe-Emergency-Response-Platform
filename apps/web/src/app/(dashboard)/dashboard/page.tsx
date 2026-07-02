'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { vehicleApi, emergencyApi } from '@/lib/api'
import { formatDateTime, STATUS_CONFIG, SEVERITY_CONFIG } from '@/lib/utils'
import { Card, CardContent, StatCard, Badge, Button, Spinner, EmptyState } from '@/components/ui/index'

export default function DashboardPage() {
  const { user } = useAuthStore()
  const [vehicles, setVehicles] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([vehicleApi.list(), emergencyApi.myEvents()])
      .then(([v, e]) => { setVehicles(v.data.data.vehicles); setEvents(e.data.data.events) })
      .finally(() => setLoading(false))
  }, [])

  const activeEvents = events.filter(e => e.status === 'ACTIVE')
  const resolvedEvents = events.filter(e => e.status === 'RESOLVED')
  const vehiclesWithQr = vehicles.filter(v => v.qrCode?.isActive)

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Spinner className="w-8 h-8 text-red-600" />
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-black text-gray-900">
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'} 👋
        </h1>
        <p className="text-muted-foreground mt-1">Your RoadSafe dashboard — stay protected on every journey.</p>
      </div>

      {/* Active emergency banner */}
      {activeEvents.length > 0 && (
        <div className="bg-red-600 text-white rounded-2xl p-5 flex items-center justify-between animate-pulse">
          <div>
            <p className="font-black text-lg">🚨 Active Emergency</p>
            <p className="text-red-100 text-sm">{activeEvents.length} active event{activeEvents.length > 1 ? 's' : ''} in progress</p>
          </div>
          <Link href="/events">
            <Button variant="outline" className="text-white border-white hover:bg-red-700 hover:text-white bg-transparent">
              View Now
            </Button>
          </Link>
        </div>
      )}

      {/* Setup progress */}
      {(vehiclesWithQr.length === 0 || vehicles.length === 0) && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-5">
            <p className="font-bold text-orange-800 mb-3">⚠️ Complete your setup to stay protected</p>
            <div className="space-y-2">
              {vehicles.length === 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-orange-400 flex-shrink-0" />
                  <p className="text-sm text-orange-700">Add your vehicle and generate an emergency QR code</p>
                  <Link href="/vehicles" className="ml-auto text-sm text-orange-700 font-semibold underline">Fix →</Link>
                </div>
              )}
              {vehicles.length > 0 && vehiclesWithQr.length === 0 && (
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-2 border-orange-400 flex-shrink-0" />
                  <p className="text-sm text-orange-700">Generate a QR code for your vehicle</p>
                  <Link href="/vehicles" className="ml-auto text-sm text-orange-700 font-semibold underline">Fix →</Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Vehicles" value={vehicles.length} icon="🚗" color="blue" />
        <StatCard label="QR Codes Active" value={vehiclesWithQr.length} icon="📱" color="green" />
        <StatCard label="Emergency Events" value={events.length} icon="🚨" color="red" />
        <StatCard label="Resolved Safely" value={resolvedEvents.length} icon="✅" color="purple" />
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { href: '/vehicles', icon: '➕', label: 'Add Vehicle', desc: 'Register & get QR' },
            { href: '/profile', icon: '🩺', label: 'Medical Passport', desc: 'Update health info' },
            { href: '/emergency-contacts', icon: '👨‍👩‍👦', label: 'Family Contacts', desc: 'Who to alert' },
            { href: '/vehicles', icon: '📥', label: 'Download QR', desc: 'Print for vehicle' },
          ].map(a => (
            <Link key={a.href + a.label} href={a.href}>
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer h-full">
                <p className="text-2xl mb-2">{a.icon}</p>
                <p className="font-bold text-sm text-gray-900">{a.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* My vehicles with QR status */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900">My Vehicles</h2>
          <Link href="/vehicles" className="text-sm text-red-600 font-medium">Manage →</Link>
        </div>
        {vehicles.length === 0 ? (
          <Card>
            <EmptyState icon="🚗" title="No vehicles yet" description="Add your vehicle to generate an emergency QR code."
              action={<Link href="/vehicles"><Button variant="danger">Add Vehicle</Button></Link>} />
          </Card>
        ) : (
          <div className="space-y-2">
            {vehicles.slice(0, 3).map((v: any) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-xl">
                      {v.vehicleType === 'CAR' ? '🚗' : v.vehicleType === 'MOTORCYCLE' ? '🏍️' : '🚌'}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{v.vehicleNumber}</p>
                      <p className="text-xs text-muted-foreground">{[v.color, v.make, v.model].filter(Boolean).join(' ')}</p>
                    </div>
                  </div>
                  <Badge variant={v.qrCode?.isActive ? 'success' : 'warning'}>
                    {v.qrCode?.isActive ? '✓ QR Active' : '⚠ No QR'}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">Recent Emergency Events</h2>
            <Link href="/events" className="text-sm text-red-600 font-medium">View all →</Link>
          </div>
          <div className="space-y-2">
            {events.slice(0, 3).map((ev: any) => {
              const status = STATUS_CONFIG[ev.status as keyof typeof STATUS_CONFIG]
              const severity = ev.aiSeverity ? SEVERITY_CONFIG[ev.aiSeverity as keyof typeof SEVERITY_CONFIG] : null
              return (
                <Link key={ev.id} href={`/events/${ev.id}`}>
                  <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-sm text-gray-900">{ev.qrCode?.vehicle?.vehicleNumber || 'Vehicle'}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {severity && <Badge variant="danger">{severity.icon} {severity.label}</Badge>}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${status?.color}`}>
                          {status?.label}
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
