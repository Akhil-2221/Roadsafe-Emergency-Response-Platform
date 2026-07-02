'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { emergencyApi } from '@/lib/api'

export default function MedicalPassportPage() {
  const { qrToken } = useParams<{ qrToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [eventId, setEventId] = useState('')
  const [medical, setMedical] = useState<any>(null)
  const [searching, setSearching] = useState(false)

  // First: get eventId from latest scan of this QR
  useEffect(() => {
    if (!qrToken) return
    // Scan QR to get latest event
    emergencyApi.scanQr(qrToken)
      .then(async ({ data }) => {
        const qrCodeId = data.data.qrCodeId
        // Get latest active event for this QR from status
        // We use the most recent event — try to get it
        setLoading(false)
        setSearching(true)
      })
      .catch(err => {
        setError(err?.response?.data?.message || 'Invalid QR code')
        setLoading(false)
      })
  }, [qrToken])

  const fetchMedicalByEventId = async (evtId: string) => {
    try {
      const { data } = await emergencyApi.getMedical(evtId)
      setMedical(data.data)
      setSearching(false)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Medical passport not available. The accident must be verified first.')
      setSearching(false)
    }
  }

  const [manualEventId, setManualEventId] = useState('')
  const handleManualLookup = (e: React.FormEvent) => {
    e.preventDefault()
    if (manualEventId.trim()) fetchMedicalByEventId(manualEventId.trim())
  }

  if (loading) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 text-sm">Loading…</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-purple-700 px-5 py-6 text-white text-center">
        <div className="text-4xl mb-2">🩺</div>
        <h1 className="text-2xl font-black">Medical Passport</h1>
        <p className="text-purple-200 text-sm mt-1">For emergency responders only</p>
      </div>

      <div className="max-w-sm mx-auto px-5 py-6">
        {/* Important notice */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-1">⚠️ For First Responders</p>
          <p className="text-sm text-red-700">
            Medical passport is revealed ONLY after an accident has been AI-verified.
            Enter the Emergency Incident ID or Event ID from the emergency alert.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {medical ? (
          <MedicalDisplay medical={medical} />
        ) : (
          <form onSubmit={handleManualLookup} className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Emergency Event ID <span className="text-red-500">*</span>
              </label>
              <input
                value={manualEventId}
                onChange={e => setManualEventId(e.target.value)}
                placeholder="Enter Event ID from emergency alert"
                className="w-full h-12 px-4 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">This is provided in the emergency SMS/WhatsApp alert sent to family members</p>
            </div>
            <button type="submit" disabled={!manualEventId.trim() || searching}
              className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl disabled:opacity-50">
              {searching ? '🔍 Loading…' : '🩺 View Medical Passport'}
            </button>

            <div className="text-center">
              <a href="tel:112" className="text-red-600 font-bold text-sm">📞 Call 112 for Emergency</a>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function MedicalDisplay({ medical }: { medical: any }) {
  return (
    <div className="space-y-4">
      {/* Critical info first */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-600 rounded-2xl p-4 text-white text-center">
          <p className="text-xs font-bold opacity-80 uppercase">Blood Group</p>
          <p className="text-4xl font-black mt-1">{medical.bloodGroup || '?'}</p>
        </div>
        <div className={`rounded-2xl p-4 text-center ${medical.organDonor ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
          <p className="text-xs font-bold opacity-80 uppercase">Organ Donor</p>
          <p className="text-2xl font-black mt-1">{medical.organDonor ? '✅ YES' : '❌ No'}</p>
        </div>
      </div>

      {/* Allergies — CRITICAL for treatment */}
      {medical.allergies?.length > 0 && (
        <div className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-4">
          <p className="font-black text-orange-700 mb-2">⚠️ ALLERGIES — CRITICAL</p>
          <div className="flex flex-wrap gap-2">
            {medical.allergies.map((a: string) => (
              <span key={a} className="bg-orange-500 text-white font-black text-sm px-3 py-1.5 rounded-xl">{a}</span>
            ))}
          </div>
        </div>
      )}

      {/* Conditions */}
      {medical.chronicConditions?.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="font-bold text-blue-700 mb-2">🏥 Chronic Conditions</p>
          <div className="flex flex-wrap gap-2">
            {medical.chronicConditions.map((c: string) => (
              <span key={c} className="bg-blue-600 text-white font-semibold text-sm px-3 py-1.5 rounded-xl">{c}</span>
            ))}
          </div>
        </div>
      )}

      {/* Medications */}
      {medical.currentMedications?.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4">
          <p className="font-bold text-purple-700 mb-2">💊 Current Medications</p>
          <div className="flex flex-wrap gap-2">
            {medical.currentMedications.map((m: string) => (
              <span key={m} className="bg-purple-600 text-white font-semibold text-sm px-3 py-1.5 rounded-xl">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {medical.medicalNotes && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <p className="font-bold text-gray-700 mb-2">📝 Additional Notes</p>
          <p className="text-sm text-gray-700 leading-relaxed">{medical.medicalNotes}</p>
        </div>
      )}

      {/* Patient name */}
      <div className="bg-gray-50 rounded-2xl p-4">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-500">Patient</span>
          <span className="font-bold text-gray-900">{medical.fullName}</span>
        </div>
      </div>

      <p className="text-xs text-center text-gray-400 border-t pt-3">
        ⚠️ This medical information is confidential. For emergency use only.
        <br />Accessed: {new Date(medical.accessedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
      </p>

      <a href="tel:112" className="block w-full py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center">
        📞 Call 112
      </a>
    </div>
  )
}
