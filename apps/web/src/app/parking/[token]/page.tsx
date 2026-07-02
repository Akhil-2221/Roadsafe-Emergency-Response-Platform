'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getErrorMessage } from '@/lib/utils'

const REASONS = [
  { value: 'BLOCKING_GATE', label: '🚪 Blocking a Gate' },
  { value: 'BLOCKING_VEHICLE', label: '🚗 Blocking My Vehicle' },
  { value: 'WRONG_PARKING', label: '❌ Wrong Parking' },
  { value: 'EMERGENCY', label: '🚨 Emergency Access Blocked' },
  { value: 'OTHER', label: '💬 Other' },
]

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ParkingPage() {
  const { token } = useParams<{ token: string }>()
  const [vehicle, setVehicle] = useState<any>(null)
  const [parkingQrId, setParkingQrId] = useState('')
  const [step, setStep] = useState<'LOADING' | 'FORM' | 'SUCCESS' | 'ERROR'>('LOADING')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ callerName: '', callerPhone: '', reason: '', message: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch(`${API}/api/parking/scan/${token}`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.message)
        setVehicle(d.data.vehicle)
        setParkingQrId(d.data.parkingQrId)
        setStep('FORM')
      })
      .catch(err => { setError(err.message || 'Invalid QR code'); setStep('ERROR') })
  }, [token])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.callerName.trim()) errs.callerName = 'Your name is required'
    if (!form.callerPhone) errs.callerPhone = 'Your phone number is required'
    else if (!/^\+?[1-9]\d{9,14}$/.test(form.callerPhone.replace(/\s/g, ''))) errs.callerPhone = 'Enter a valid phone number'
    if (!form.reason) errs.reason = 'Please select a reason'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const r = await fetch(`${API}/api/parking/${parkingQrId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!d.success) throw new Error(d.message)
      setStep('SUCCESS')
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setSubmitting(false) }
  }

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(p => ({ ...p, [f]: e.target.value }))
    setFieldErrors(p => ({ ...p, [f]: '' }))
  }

  if (step === 'LOADING') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (step === 'ERROR') return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-5xl mb-4">⚠️</p>
        <h2 className="text-xl font-bold mb-2">Invalid QR Code</h2>
        <p className="text-gray-500">{error}</p>
      </div>
    </div>
  )

  if (step === 'SUCCESS') return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-white">
      <div className="text-center max-w-sm">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-2xl font-black mb-2">Owner Notified!</h2>
        <p className="text-gray-500 mb-6">The vehicle owner has been sent an SMS notification and should move their vehicle shortly.</p>
        <p className="text-sm text-gray-400">You can close this page.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-blue-600 px-5 py-6 text-white text-center">
        <p className="text-sm opacity-80 mb-1">🅿️ RoadSafe Parking</p>
        <h1 className="text-2xl font-black">Notify Vehicle Owner</h1>
      </div>

      <div className="max-w-sm mx-auto px-5 py-6 space-y-5">
        {/* Vehicle info */}
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-2">Vehicle</p>
          <p className="font-black text-2xl text-gray-900">{vehicle?.vehicleNumber}</p>
          <p className="text-gray-500 text-sm mt-0.5">
            {[vehicle?.color, vehicle?.make, vehicle?.model].filter(Boolean).join(' ')}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input value={form.callerName} onChange={set('callerName')} placeholder="Enter your name"
              className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {fieldErrors.callerName && <p className="text-xs text-red-500 mt-1">{fieldErrors.callerName}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Your Phone <span className="text-red-500">*</span>
            </label>
            <input type="tel" value={form.callerPhone} onChange={set('callerPhone')} placeholder="+91XXXXXXXXXX"
              className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            {fieldErrors.callerPhone && <p className="text-xs text-red-500 mt-1">{fieldErrors.callerPhone}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <select value={form.reason} onChange={set('reason')}
              className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="">Select reason…</option>
              {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {fieldErrors.reason && <p className="text-xs text-red-500 mt-1">{fieldErrors.reason}</p>}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Message</label>
            <textarea value={form.message} onChange={set('message')} placeholder="Any additional details…" rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <p className="text-xs text-gray-400">
            Your contact details are not shared with the vehicle owner. Only the reason and a notification are sent.
          </p>

          <button type="submit" disabled={submitting}
            className="w-full py-4 bg-blue-600 text-white font-black text-lg rounded-2xl disabled:opacity-50 active:scale-95 transition">
            {submitting ? 'Sending…' : '📨 Notify Owner'}
          </button>
        </form>
      </div>
    </div>
  )
}
