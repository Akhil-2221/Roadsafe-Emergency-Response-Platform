'use client'
import { useEffect, useState } from 'react'
import { vehicleApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import {
  Card, CardContent, Button, Input, Select, FormField,
  Badge, Alert, Spinner, EmptyState,
} from '@/components/ui/index'

const VEHICLE_TYPES = [
  { value: '', label: 'Select type…' },
  { value: 'CAR', label: '🚗 Car' },
  { value: 'MOTORCYCLE', label: '🏍️ Motorcycle' },
  { value: 'TRUCK', label: '🚛 Truck' },
  { value: 'BUS', label: '🚌 Bus' },
  { value: 'AUTO_RICKSHAW', label: '🛺 Auto Rickshaw' },
  { value: 'OTHER', label: '🚙 Other' },
]

const YEARS = Array.from({ length: 30 }, (_, i) => {
  const y = new Date().getFullYear() - i
  return { value: String(y), label: String(y) }
})

const BLANK = { vehicleNumber: '', vehicleType: '', make: '', model: '', color: '', yearOfMfg: '' }

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [generatingQr, setGeneratingQr] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = () => vehicleApi.list().then(r => setVehicles(r.data.data.vehicles)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [f]: e.target.value }))

  const validate = () => {
    const errs: Record<string, string> = {}
    const num = form.vehicleNumber.trim().toUpperCase()
    if (!num) errs.vehicleNumber = 'Vehicle number is required'
    else if (num.length < 4) errs.vehicleNumber = 'Enter a valid vehicle number'
    if (!form.vehicleType) errs.vehicleType = 'Select vehicle type'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = {
        vehicleNumber: form.vehicleNumber.trim().toUpperCase(),
        vehicleType: form.vehicleType,
        make: form.make || undefined,
        model: form.model || undefined,
        color: form.color || undefined,
        yearOfMfg: form.yearOfMfg ? parseInt(form.yearOfMfg) : undefined,
      }
      if (editing) await vehicleApi.update(editing, payload)
      else await vehicleApi.create(payload)
      setShowForm(false); setEditing(null); setForm(BLANK)
      load()
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSubmitting(false) }
  }

  const startEdit = (v: any) => {
    setEditing(v.id)
    setForm({
      vehicleNumber: v.vehicleNumber,
      vehicleType: v.vehicleType,
      make: v.make || '',
      model: v.model || '',
      color: v.color || '',
      yearOfMfg: v.yearOfMfg ? String(v.yearOfMfg) : '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this vehicle? The QR code will be deactivated.')) return
    setDeletingId(id)
    try { await vehicleApi.delete(id); load() }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setDeletingId(null) }
  }

  const generateQr = async (id: string) => {
    setGeneratingQr(id)
    try { await vehicleApi.generateQr(id); load() }
    catch (err) { setError(getErrorMessage(err)) }
    finally { setGeneratingQr(null) }
  }

  const downloadQr = (url: string, vehicleNumber: string) => {
    const a = document.createElement('a')
    a.href = url; a.download = `roadsafe-qr-${vehicleNumber}.png`; a.click()
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">My Vehicles</h1>
          <p className="text-muted-foreground text-sm mt-1">Register vehicles and generate emergency QR codes.</p>
        </div>
        <Button variant="danger" onClick={() => { setShowForm(true); setEditing(null); setForm(BLANK) }}>
          + Add Vehicle
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <Card className="border-red-100">
          <CardContent className="pt-5">
            <h2 className="font-bold text-lg mb-4">{editing ? 'Edit Vehicle' : 'Add New Vehicle'}</h2>
            {error && <Alert variant="danger" className="mb-4">{error}</Alert>}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Vehicle Number" required>
                  <Input placeholder="TS09EA1234" value={form.vehicleNumber} onChange={set('vehicleNumber')}
                    error={fieldErrors.vehicleNumber} className="uppercase" disabled={!!editing} />
                </FormField>
                <FormField label="Vehicle Type" required>
                  <Select options={VEHICLE_TYPES} value={form.vehicleType}
                    onChange={set('vehicleType')} error={fieldErrors.vehicleType} />
                </FormField>
                <FormField label="Make (Brand)">
                  <Input placeholder="Maruti Suzuki, Honda…" value={form.make} onChange={set('make')} />
                </FormField>
                <FormField label="Model">
                  <Input placeholder="Swift, Activa…" value={form.model} onChange={set('model')} />
                </FormField>
                <FormField label="Color">
                  <Input placeholder="White, Black, Silver…" value={form.color} onChange={set('color')} />
                </FormField>
                <FormField label="Year of Manufacture">
                  <Select options={[{ value: '', label: 'Select year…' }, ...YEARS]}
                    value={form.yearOfMfg} onChange={set('yearOfMfg')} />
                </FormField>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" variant="danger" loading={submitting} className="flex-1">
                  {editing ? 'Update Vehicle' : 'Add Vehicle'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditing(null); setForm(BLANK) }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Vehicle list */}
      {vehicles.length === 0 && !showForm ? (
        <Card>
          <EmptyState icon="🚗" title="No vehicles registered" description="Add your vehicle to generate an emergency QR code that bystanders can scan."
            action={<Button variant="danger" onClick={() => setShowForm(true)}>Add Your First Vehicle</Button>} />
        </Card>
      ) : (
        <div className="space-y-4">
          {vehicles.map((v: any) => (
            <Card key={v.id} className="overflow-hidden">
              <CardContent className="pt-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Vehicle info */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0">
                      {v.vehicleType === 'CAR' ? '🚗' : v.vehicleType === 'MOTORCYCLE' ? '🏍️' : v.vehicleType === 'TRUCK' ? '🚛' : v.vehicleType === 'AUTO_RICKSHAW' ? '🛺' : '🚌'}
                    </div>
                    <div>
                      <p className="font-black text-xl text-gray-900 tracking-wide">{v.vehicleNumber}</p>
                      <p className="text-muted-foreground text-sm">{[v.yearOfMfg, v.color, v.make, v.model].filter(Boolean).join(' · ')}</p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant={v.qrCode?.isActive ? 'success' : 'muted'}>
                          {v.qrCode?.isActive ? '✓ Emergency QR Active' : '○ No Emergency QR'}
                        </Badge>
                        {v.qrCode?.scanCount > 0 && (
                          <Badge variant="muted">{v.qrCode.scanCount} scan{v.qrCode.scanCount !== 1 ? 's' : ''}</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* QR preview */}
                  {v.qrCode?.qrImageUrl && (
                    <div className="flex-shrink-0">
                      <img src={v.qrCode.qrImageUrl} alt="QR Code" className="w-24 h-24 rounded-xl border border-gray-200" />
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                  {v.qrCode?.isActive ? (
                    <>
                      <Button size="sm" variant="outline"
                        onClick={() => downloadQr(v.qrCode.qrImageUrl, v.vehicleNumber)}>
                        📥 Download QR
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => generateQr(v.id)}
                        loading={generatingQr === v.id}>
                        🔄 Regenerate QR
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="danger"
                      onClick={() => generateQr(v.id)}
                      loading={generatingQr === v.id}>
                      🔑 Generate QR Code
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => startEdit(v)}>✏️ Edit</Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => handleDelete(v.id)}
                    loading={deletingId === v.id}
                    className="text-red-500 hover:bg-red-50">
                    🗑️ Remove
                  </Button>
                </div>

                {/* QR instructions */}
                {v.qrCode?.isActive && (
                  <div className="mt-3 bg-blue-50 rounded-xl p-3">
                    <p className="text-xs text-blue-700 font-semibold">💡 Print the QR and stick it on your windshield / rear window</p>
                    <p className="text-xs text-blue-600 mt-0.5">When scanned after an accident, it instantly starts the emergency response workflow.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
