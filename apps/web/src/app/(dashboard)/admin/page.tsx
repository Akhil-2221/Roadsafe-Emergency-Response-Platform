'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { formatDateTime, STATUS_CONFIG, SEVERITY_CONFIG } from '@/lib/utils'
import { Card, CardContent, StatCard, Badge, Spinner, Alert, Button } from '@/components/ui/index'

export default function AdminPage() {
  const { user } = useAuthStore()
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [tab, setTab] = useState<'overview' | 'users' | 'events' | 'audit'>('overview')
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/stats'),
      api.get('/api/admin/users?limit=20'),
      api.get('/api/admin/events?limit=20'),
    ]).then(([s, u, e]) => {
      setStats(s.data.data)
      setUsers(u.data.data.users)
      setEvents(e.data.data.events)
    }).catch(() => setError('Failed to load admin data'))
    .finally(() => setLoading(false))
  }, [])

  const loadAudit = async () => {
    const r = await api.get('/api/admin/audit-logs?limit=50')
    setAuditLogs(r.data.data.logs)
  }

  const toggleUser = async (userId: string, isActive: boolean) => {
    await api.put(`/api/admin/users/${userId}/status`, { isActive: !isActive })
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !isActive } : u))
  }

  if (!user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return <Alert variant="danger">Access denied. Admin only.</Alert>
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>
  if (error) return <Alert variant="danger">{error}</Alert>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-gray-900">⚙️ Admin Panel</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform overview, user management, and emergency event monitoring.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {(['overview', 'users', 'events', 'audit'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === 'audit' && !auditLogs.length) loadAudit() }}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold capitalize transition whitespace-nowrap ${tab === t ? 'bg-white shadow text-gray-900' : 'text-muted-foreground hover:text-gray-700'}`}>
            {t === 'overview' ? '📊 Overview' : t === 'users' ? '👥 Users' : t === 'events' ? '🚨 Events' : '📋 Audit'}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Users" value={stats.totalUsers} icon="👥" color="blue" />
            <StatCard label="Vehicles" value={stats.totalVehicles} icon="🚗" color="green" />
            <StatCard label="Total Events" value={stats.totalEvents} icon="🚨" color="red" />
            <StatCard label="Today's Events" value={stats.todayEvents} icon="📅" color="orange" />
          </div>

          {stats.activeEvents > 0 && (
            <div className="bg-red-600 text-white rounded-2xl p-5">
              <p className="font-black text-xl">🚨 {stats.activeEvents} Active Emergency{stats.activeEvents > 1 ? ' Events' : ''}</p>
              <p className="text-red-100 text-sm mt-1">Immediate attention may be required</p>
            </div>
          )}

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-bold mb-4">Events by Status</h2>
              <div className="space-y-2">
                {stats.eventsByStatus?.map((s: any) => {
                  const cfg = STATUS_CONFIG[s.status as keyof typeof STATUS_CONFIG]
                  return (
                    <div key={s.status} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg?.color || 'bg-gray-100 text-gray-600'}`}>{cfg?.label || s.status}</span>
                      <span className="font-bold">{s._count}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <h2 className="font-bold mb-4">Recent Emergency Events</h2>
              <div className="space-y-3">
                {stats.recentEvents?.slice(0, 5).map((ev: any) => {
                  const status = STATUS_CONFIG[ev.status as keyof typeof STATUS_CONFIG]
                  return (
                    <div key={ev.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="font-semibold text-sm">{ev.qrCode?.vehicle?.vehicleNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {ev.hospital && <span className="text-xs text-blue-600">{ev.hospital.name}</span>}
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status?.color}`}>{status?.label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users */}
      {tab === 'users' && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-4">All Users ({users.length})</h2>
            <div className="space-y-3">
              {users.map((u: any) => (
                <div key={u.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-sm flex-shrink-0">
                      {(u.profile?.fullName || u.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{u.profile?.fullName || '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant={u.role === 'SUPER_ADMIN' ? 'danger' : u.role === 'ADMIN' ? 'warning' : 'muted'} className="text-xs">
                          {u.role}
                        </Badge>
                        <Badge variant={u.emailVerified ? 'success' : 'warning'} className="text-xs">
                          {u.emailVerified ? 'Verified' : 'Unverified'}
                        </Badge>
                        <Badge variant="muted" className="text-xs">{u._count?.vehicles || 0} vehicles</Badge>
                      </div>
                    </div>
                  </div>
                  {u.id !== user?.id && (
                    <Button size="sm" variant={u.isActive ? 'outline' : 'ghost'}
                      className={u.isActive ? 'text-red-500 border-red-200 hover:bg-red-50 flex-shrink-0' : 'text-green-600 hover:bg-green-50 flex-shrink-0'}
                      onClick={() => toggleUser(u.id, u.isActive)}>
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Events */}
      {tab === 'events' && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-4">All Emergency Events ({events.length})</h2>
            <div className="space-y-3">
              {events.map((ev: any) => {
                const status = STATUS_CONFIG[ev.status as keyof typeof STATUS_CONFIG]
                const severity = ev.aiSeverity ? SEVERITY_CONFIG[ev.aiSeverity as keyof typeof SEVERITY_CONFIG] : null
                return (
                  <div key={ev.id} className="py-3 border-b border-gray-50 last:border-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-sm">{ev.qrCode?.vehicle?.vehicleNumber}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(ev.createdAt)}</p>
                        {ev.hospital && <p className="text-xs text-blue-600 mt-0.5">🏥 {ev.hospital.name}</p>}
                        <p className="text-xs text-muted-foreground">{ev._count?.notifications || 0} notifications sent</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status?.color}`}>{status?.label}</span>
                        {severity && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${severity.color}`}>{severity.icon} {severity.label}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit logs */}
      {tab === 'audit' && (
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-bold mb-4">Audit Logs</h2>
            {auditLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Loading audit logs…</div>
            ) : (
              <div className="space-y-2 font-mono text-xs">
                {auditLogs.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="text-muted-foreground flex-shrink-0">{new Date(log.createdAt).toLocaleTimeString('en-IN')}</span>
                    <span className="bg-gray-100 px-2 py-0.5 rounded font-bold text-gray-700 flex-shrink-0">{log.action}</span>
                    <span className="text-gray-600 truncate">{log.resource} {log.resourceId ? `· ${log.resourceId.slice(0, 8)}…` : ''}</span>
                    <span className="text-muted-foreground ml-auto flex-shrink-0">{log.user?.email || log.ipAddress || 'anon'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
