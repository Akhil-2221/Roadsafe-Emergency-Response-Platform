'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { emergencyApi } from '@/lib/api'
import { DirectionsMap, StaticMap } from '@/components/maps/MapComponents'

// ─── Types ────────────────────────────────────────────────────────
type Step =
  | 'LOADING' | 'INFO' | 'PERMISSIONS' | 'AUTH'
  | 'ACTIVATING' | 'ACTIVE' | 'ERROR'

interface VehicleInfo {
  vehicleNumber: string; vehicleType: string
  make?: string; model?: string; color?: string
}

interface Hospital {
  id?: string; name: string; address: string; city?: string
  phone: string; emergencyPhone?: string
  latitude?: number; longitude?: number
  hasTraumaCenter?: boolean; hasICU?: boolean; hasBloodBank?: boolean
  distanceKm?: number; etaMinutes?: number; navigationUrl?: string
}

interface EmergencyContact {
  name: string; relationship: string; phone: string; priority: number
}

interface MedicalInfo {
  bloodGroup: string
  allergies?: string[]
  chronicConditions?: string[]
  currentMedications?: string[]
  organDonor?: boolean
  medicalNotes?: string
}

interface RevealData {
  incidentId: string; status: string
  victimName: string; vehicleNumber: string
  medical: MedicalInfo
  emergencyContacts: EmergencyContact[]
  nearbyHospitals: Hospital[]
  familyNotified: boolean
  trackingUrl: string
}

interface TimelineEntry {
  action: string; description: string; createdAt: string
}

interface EventData {
  id: string; incidentId: string; shareToken: string; status: string
  aiSeverity?: string
  hospitalEtaMinutes?: number; hospitalRouteUrl?: string
  hospital?: Hospital
  timeline?: TimelineEntry[]
  ownerAckedOk?: boolean
}

// ─── Bystander guidance per severity ────────────────────────────
const GUIDANCE: Record<string, string[]> = {
  CRITICAL: [
    '🚨 Call 112 IMMEDIATELY — do not wait',
    '🚫 Do NOT move the victim — spinal injury risk',
    '🩹 Apply firm pressure to any bleeding wounds',
    '🫁 Check breathing — tilt head back gently if unconscious',
    '🔥 Only move victim if vehicle is on fire',
    '👥 Keep onlookers back — victim needs air and space',
    '🌡️ Keep victim warm — use a jacket or blanket',
  ],
  HIGH: [
    '📞 Call 112 immediately',
    '🚫 Do not remove helmet — risk of further injury',
    '🩸 Control bleeding with firm constant pressure',
    '🌡️ Keep victim still, warm and conscious',
    '🗣️ Talk to them calmly: "Help is coming, stay with us"',
    '💧 Do NOT give food, water, or medication',
  ],
  MEDIUM: [
    '📞 Call 112 if not already done',
    '⚠️ Ask the victim not to move suddenly',
    '🩺 Check for visible injuries carefully',
    '💧 No food, water, or medication',
    '🕐 Stay with them until ambulance arrives',
  ],
  LOW: [
    '✅ Accident appears minor — stay alert',
    '📞 Call 112 if anyone reports pain or dizziness',
    '📸 Document the scene for police and insurance',
    '🔒 Keep the area safe from oncoming traffic',
  ],
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  CRITICAL: { bg: 'bg-red-600',    text: 'text-white', label: 'CRITICAL', icon: '🚨' },
  HIGH:     { bg: 'bg-orange-500', text: 'text-white', label: 'HIGH',     icon: '🔴' },
  MEDIUM:   { bg: 'bg-yellow-400', text: 'text-gray-900', label: 'MEDIUM', icon: '🟡' },
  LOW:      { bg: 'bg-green-500',  text: 'text-white', label: 'LOW',      icon: '🟢' },
}

// ─── Main Component ───────────────────────────────────────────────
export default function EmergencyPage() {
  const { qrToken } = useParams<{ qrToken: string }>()
  const [step, setStep] = useState<Step>('LOADING')
  const [vehicle, setVehicle] = useState<VehicleInfo | null>(null)
  const [qrCodeId, setQrCodeId] = useState<string | null>(null)
  const [vehicleId, setVehicleId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [eventData, setEventData] = useState<EventData | null>(null)
  const [reveal, setReveal] = useState<RevealData | null>(null)
  const [bystanderName, setBystanderName] = useState('')
  const [bystanderPhone, setBystanderPhone] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [locationUpdates, setLocationUpdates] = useState(0)
  const [evidencePhoto, setEvidencePhoto] = useState<File | null>(null)
  const [evidenceUploaded, setEvidenceUploaded] = useState(false)
  const sseRef = useRef<EventSource | null>(null)
  const locationWatchRef = useRef<number | null>(null)
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Declaration of physical presence — required before submitting
  const [declarationAccepted, setDeclarationAccepted] = useState(false)

  // Bystander OTP verification — THE authentication step (replaces photo/selfie)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')

  // ─── Cleanup on unmount ──────────────────────────────────────
  useEffect(() => () => {
    sseRef.current?.close()
    if (locationWatchRef.current !== null) navigator.geolocation.clearWatch(locationWatchRef.current)
    if (locationIntervalRef.current) clearInterval(locationIntervalRef.current)
  }, [])

  // ─── STEP 1: Verify QR token ─────────────────────────────────
  useEffect(() => {
    if (!qrToken) return
    emergencyApi.scanQr(qrToken)
      .then(({ data }) => {
        setVehicle(data.data.vehicle)
        setQrCodeId(data.data.qrCodeId)
        setVehicleId(data.data.vehicle?.id)
        setStep('INFO')
      })
      .catch(err => {
        setError(err?.response?.data?.message || 'Invalid or expired QR code')
        setStep('ERROR')
      })
  }, [qrToken])

  // ─── Bystander OTP handlers ────────────────────────────────────
  const handleSendOtp = async () => {
    if (!bystanderPhone.trim()) { setOtpError('Enter your mobile number first'); return }
    setOtpSending(true); setOtpError('')
    try {
      await emergencyApi.sendOtp(bystanderPhone.trim())
      setOtpSent(true)
    } catch (err: any) {
      setOtpError(err?.response?.data?.message || 'Failed to send OTP')
    } finally {
      setOtpSending(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) { setOtpError('Enter the 6-digit code'); return }
    setOtpVerifying(true); setOtpError('')
    try {
      await emergencyApi.verifyOtp(bystanderPhone.trim(), otpCode.trim())
      setOtpVerified(true)
      setError(null)
    } catch (err: any) {
      setOtpError(err?.response?.data?.message || 'Incorrect code')
    } finally {
      setOtpVerifying(false)
    }
  }

  // ─── STEP 2: Request GPS ─────────────────────────────────────
  const requestPermissions = useCallback(() => {
    setStep('PERMISSIONS')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setStep('AUTH')
      },
      () => {
        setError('GPS is required to pinpoint the accident location for emergency services. Please enable location access and try again.')
        setStep('ERROR')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }, [])

  // ─── Start live location tracking ───────────────────────────
  const startLiveLocationTracking = useCallback((evtId: string) => {
    if (navigator.geolocation) {
      locationWatchRef.current = navigator.geolocation.watchPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }

    locationIntervalRef.current = setInterval(async () => {
      setLocation(loc => {
        if (loc) {
          emergencyApi.updateLocation(evtId, loc.lat, loc.lng, loc.accuracy).catch(() => {})
          setLocationUpdates(n => n + 1)
        }
        return loc
      })
    }, 30000)
  }, [])

  // ─── SSE / polling for status (timeline, hospital ETA refinements) ──
  const startSSE = useCallback((evtId: string) => {
    const url = emergencyApi.getStreamUrl(evtId)
    const es = new EventSource(url)
    sseRef.current = es

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'status' && msg.data) {
          setEventData(msg.data)
          if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(msg.data.status)) es.close()
        }
      } catch {}
    }
    es.onerror = () => { es.close(); startPolling(evtId) }
  }, [])

  const startPolling = useCallback((evtId: string) => {
    let attempts = 0
    const iv = setInterval(async () => {
      attempts++
      try {
        const { data } = await emergencyApi.getStatus(evtId)
        setEventData(data.data)
        if (['RESOLVED', 'FALSE_ALARM', 'CANCELLED'].includes(data.data.status) || attempts > 60) clearInterval(iv)
      } catch {}
    }, 5000)
  }, [])

  // ─── STEP 3: Submit — creates event, then immediately reveals everything ──
  const submitEmergency = async () => {
    if (!location) return
    if (!declarationAccepted) { setError('Please confirm you are physically present at the accident scene'); return }
    if (!otpVerified) { setError('Please verify your mobile number with the OTP first'); return }

    setSubmitting(true); setStep('ACTIVATING'); setError(null)
    try {
      const { data: startData } = await emergencyApi.startEvent({
        qrCodeId: qrCodeId || undefined,
        vehicleId: vehicleId || undefined,
        accessMethod: 'QR_SCAN',
        bystanderName: bystanderName.trim() || undefined,
        bystanderPhone: bystanderPhone.trim(),
        latitude: location.lat,
        longitude: location.lng,
        locationAccuracy: location.accuracy,
        declarationAccepted: true,
        bystanderOtpVerified: true,
      })
      const { eventId: evId, incidentId: iId, shareToken: sToken } = startData.data
      setEventId(evId); setIncidentId(iId); setShareToken(sToken)

      // Reveal everything immediately — family notification + hospital
      // lookup are already running in the background on the server.
      const { data: revealData } = await emergencyApi.revealEmergency(evId)
      setReveal(revealData.data)

      setStep('ACTIVE')
      startLiveLocationTracking(evId)
      startSSE(evId)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to report. Please call 112 directly.')
      setStep('ERROR')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Optional: attach a photo afterwards (never blocks the reveal) ──
  const handleAttachPhoto = async (file: File | null) => {
    if (!file || !eventId) return
    setEvidencePhoto(file)
    try {
      const fd = new FormData()
      fd.append('accidentPhoto', file)
      await emergencyApi.uploadEvidence(eventId, fd)
      setEvidenceUploaded(true)
    } catch {}
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  if (step === 'LOADING') return (
    <Screen bg="white">
      <Spinner size="lg" />
      <p className="text-gray-500 mt-4 text-sm">Verifying emergency QR…</p>
    </Screen>
  )

  if (step === 'ERROR') return (
    <Screen bg="white">
      <div className="text-center px-6 max-w-sm">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-black text-gray-900 mb-2">Unable to Process</h2>
        <p className="text-gray-500 text-sm mb-6">{error}</p>
        <a href="tel:112" className="block w-full py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center mb-3">
          📞 Call 112 Now
        </a>
        <a href="/emergency-lookup" className="block w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-2xl text-center text-sm">
          🔍 Search by Vehicle Number Instead
        </a>
      </div>
    </Screen>
  )

  if (step === 'INFO') return (
    <Screen bg="red">
      <div className="flex flex-col items-center gap-5 text-center px-5 w-full max-w-sm">
        <div className="text-6xl animate-pulse">🚨</div>
        <div>
          <p className="text-red-200 text-xs uppercase tracking-widest font-bold mb-1">Emergency Response</p>
          <h1 className="text-4xl font-black text-white">ACCIDENT?</h1>
        </div>
        <div className="w-full bg-white/15 backdrop-blur rounded-2xl p-4 text-left">
          <p className="text-red-200 text-xs uppercase tracking-widest font-bold mb-2">Vehicle Identified</p>
          <p className="text-white font-black text-3xl tracking-wider">{vehicle?.vehicleNumber}</p>
          <p className="text-red-100 mt-1 text-sm">
            {[vehicle?.color, vehicle?.make, vehicle?.model].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="w-full space-y-3">
          <button onClick={requestPermissions}
            className="w-full py-4 bg-white text-red-600 font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-transform">
            🆘 YES — Report This Accident
          </button>
          <a href="tel:112" className="block w-full py-4 bg-red-700 text-white font-bold text-base rounded-2xl text-center border border-red-500">
            📞 Call 112 Directly
          </a>
        </div>
        <p className="text-red-200 text-xs mt-2 max-w-xs">
          Tapping "Report" will capture your GPS location and, once you verify your mobile number, instantly alert the victim's family.
        </p>
      </div>
    </Screen>
  )

  if (step === 'PERMISSIONS') return (
    <Screen bg="white">
      <div className="text-center px-6">
        <div className="text-5xl mb-4">📍</div>
        <h2 className="text-xl font-black">Getting Your Location…</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto">
          Please allow GPS when your browser asks. This sends emergency services to the exact accident location.
        </p>
        <Spinner size="md" className="mt-6" />
      </div>
    </Screen>
  )

  if (step === 'AUTH') return (
    <div className="min-h-screen bg-white pb-8">
      <div className="bg-red-600 px-5 py-5 text-white">
        <p className="text-xs uppercase tracking-widest opacity-80">Emergency Report</p>
        <h1 className="text-2xl font-black">{vehicle?.vehicleNumber}</h1>
        {location && (
          <p className="text-red-200 text-xs mt-1">
            📍 GPS locked ({location.accuracy ? `±${Math.round(location.accuracy)}m` : 'acquired'})
          </p>
        )}
      </div>

      <div className="max-w-sm mx-auto px-4 mt-5 space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-blue-900">⚡ Quick Verification</p>
          <p className="text-xs text-blue-700 mt-1">
            We verify your mobile number instead of taking photos — this gets help to the family in seconds, not minutes.
          </p>
        </div>

        {/* Bystander mobile + OTP — THE authentication step */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Your Mobile Number <span className="text-red-500">(Required)</span>
          </p>
          <p className="text-xs text-gray-400">Verified so the family can call you, and to keep this system safe from misuse</p>

          <input value={bystanderName} onChange={e => setBystanderName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />

          <div className="flex gap-2">
            <input value={bystanderPhone}
              onChange={e => { setBystanderPhone(e.target.value); setOtpVerified(false); setOtpSent(false) }}
              placeholder="+91XXXXXXXXXX" type="tel"
              disabled={otpVerified}
              className="flex-1 h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white disabled:bg-green-50 disabled:border-green-300" />
            {!otpVerified && (
              <button type="button" onClick={handleSendOtp} disabled={otpSending || !bystanderPhone.trim()}
                className="px-4 h-11 bg-red-600 text-white text-xs font-bold rounded-xl whitespace-nowrap disabled:opacity-50">
                {otpSending ? '…' : otpSent ? 'Resend' : 'Send Code'}
              </button>
            )}
          </div>

          {otpSent && !otpVerified && (
            <div className="flex gap-2">
              <input
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="flex-1 h-11 px-4 border border-gray-200 rounded-xl text-sm tracking-widest font-bold focus:outline-none focus:ring-2 focus:ring-red-500 bg-white" />
              <button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                className="px-4 h-11 bg-green-600 text-white text-xs font-bold rounded-xl whitespace-nowrap disabled:opacity-50">
                {otpVerifying ? '…' : '✓ Check'}
              </button>
            </div>
          )}
          {otpVerified && (
            <p className="text-xs text-green-600 font-bold flex items-center gap-1">✓ Mobile number verified — ready to report</p>
          )}
          {otpError && <p className="text-xs text-red-500">{otpError}</p>}
        </div>

        {/* Physical presence declaration — required */}
        <label className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={declarationAccepted}
            onChange={e => { setDeclarationAccepted(e.target.checked); setError(null) }}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
          />
          <span className="text-sm text-yellow-900">
            <span className="font-bold">I confirm I am physically present</span> at the accident scene right now and the information I provide is accurate.
          </span>
        </label>

        {/* Location preview */}
        {location && (
          <div className="rounded-2xl overflow-hidden">
            <StaticMap latitude={location.lat} longitude={location.lng} height="140px" label="Your location" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
            ⚠️ {error}
          </div>
        )}

        <button
          onClick={submitEmergency}
          disabled={submitting || !declarationAccepted || !otpVerified}
          className="w-full py-5 bg-red-600 text-white font-black text-xl rounded-2xl disabled:opacity-40 shadow-xl active:scale-95 transition-transform">
          🚨 REPORT EMERGENCY
        </button>

        <p className="text-center text-xs text-gray-400">
          This will immediately alert the victim's family and reveal emergency contacts, medical info, and nearby hospitals.
        </p>
      </div>
    </div>
  )

  if (step === 'ACTIVATING') return (
    <Screen bg="white">
      <div className="w-full max-w-sm px-5 text-center">
        <div className="relative w-24 h-24 mx-auto mb-5">
          <div className="absolute inset-0 border-4 border-red-100 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center text-3xl">🚨</span>
        </div>
        <h2 className="text-2xl font-black">Activating Emergency…</h2>
        <p className="text-gray-500 text-sm mt-2 mb-6">Notifying family and revealing emergency info now.</p>

        <div className="space-y-2 text-left mb-6">
          {[
            { icon: '✓', label: 'Mobile verified', done: true },
            { icon: '📍', label: 'GPS location locked', done: true },
            { icon: '📱', label: 'Alerting emergency contacts', done: false },
            { icon: '🏥', label: 'Finding nearby hospitals', done: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <span className="text-lg">{item.icon}</span>
              <span className="text-sm text-gray-700 flex-1">{item.label}</span>
              {item.done ? <span className="text-green-500 font-bold text-lg">✓</span> : <Spinner size="sm" className="text-red-400" />}
            </div>
          ))}
        </div>

        <a href="tel:112" className="block w-full py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center">
          📞 Call 112 While Waiting
        </a>
      </div>
    </Screen>
  )

  if (step === 'ACTIVE' && reveal) {
    const sev = eventData?.aiSeverity ?? 'HIGH'
    const style = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE.HIGH
    const guidance = GUIDANCE[sev] ?? GUIDANCE.HIGH

    return (
      <div className="min-h-screen bg-gray-50 pb-16">
        {/* Header */}
        <div className={`${style.bg} px-5 py-6 ${style.text}`}>
          <div className="max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs uppercase tracking-widest opacity-70 font-semibold">Emergency Active</p>
                <h1 className="text-3xl font-black">{style.icon} {style.label}</h1>
              </div>
              <div className="text-right">
                <p className="text-xs opacity-70">Incident ID</p>
                <p className="font-black text-sm tracking-wider">{reveal.incidentId}</p>
              </div>
            </div>
            <div className="flex gap-3 text-xs opacity-80">
              <span>{reveal.familyNotified ? '✓ Family notified' : '📱 Notifying family…'}</span>
              <span>•</span>
              <span>{locationUpdates > 0 ? '📡 Location updating' : '📍 Location fixed'}</span>
            </div>
          </div>
        </div>

        <div className="max-w-sm mx-auto px-4 space-y-4 mt-4">
          {/* Primary CTA */}
          <a href="tel:112" className="block w-full py-5 bg-red-600 text-white font-black text-xl rounded-2xl text-center shadow-lg">
            📞 Call 112 — Emergency Services
          </a>

          {/* Emergency contacts — revealed immediately */}
          {reveal.emergencyContacts.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-2">
                📱 Family Emergency Contacts — Already Notified
              </p>
              <div className="space-y-2">
                {reveal.emergencyContacts.map((c, i) => (
                  <a key={i} href={`tel:${c.phone}`}
                    className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{c.name} <span className="text-gray-400 font-normal text-xs">· {c.relationship}</span></p>
                      <p className="text-xs text-gray-500">{c.phone}</p>
                    </div>
                    <span className="text-green-700 font-bold text-xs bg-white px-2 py-1 rounded-full border border-green-300">📞 Call</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Medical passport — shown immediately, no extra click */}
          <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200">
            <p className="text-xs uppercase tracking-widest text-purple-500 font-semibold mb-2">🩺 Medical Info — {reveal.victimName}</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="bg-red-600 text-white text-xs font-black px-3 py-1.5 rounded-full">🩸 {reveal.medical.bloodGroup}</span>
              {reveal.medical.organDonor && <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full">Organ Donor</span>}
            </div>
            {!!reveal.medical.allergies?.length && (
              <p className="text-sm text-gray-700"><span className="font-bold">⚠️ Allergies:</span> {reveal.medical.allergies.join(', ')}</p>
            )}
            {!!reveal.medical.chronicConditions?.length && (
              <p className="text-sm text-gray-700 mt-1"><span className="font-bold">Conditions:</span> {reveal.medical.chronicConditions.join(', ')}</p>
            )}
            {!!reveal.medical.currentMedications?.length && (
              <p className="text-sm text-gray-700 mt-1"><span className="font-bold">Medications:</span> {reveal.medical.currentMedications.join(', ')}</p>
            )}
            {reveal.medical.medicalNotes && (
              <p className="text-sm text-gray-600 mt-2 italic">{reveal.medical.medicalNotes}</p>
            )}
          </div>

          {/* Share tracking link */}
          {shareToken && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-blue-700 mb-1">📡 Family Tracking Link</p>
              <p className="text-xs text-blue-600 mb-2">Also sent to the family automatically:</p>
              <div className="flex gap-2">
                <input readOnly
                  value={`${window.location.origin}/track/${shareToken}`}
                  className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-800 font-mono" />
                <button
                  onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/track/${shareToken}`)}
                  className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg">Copy</button>
              </div>
            </div>
          )}

          {/* Nearby well-equipped hospitals */}
          {reveal.nearbyHospitals.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">🏥 Nearby Hospitals — Best First</p>
              <div className="space-y-3">
                {reveal.nearbyHospitals.map((h, i) => (
                  <div key={h.id ?? i} className={`rounded-xl p-3 ${i === 0 ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50 border border-gray-100'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-black text-gray-900 text-sm">{i === 0 && '⭐ '}{h.name}</p>
                        <p className="text-xs text-gray-500">{h.address}</p>
                      </div>
                      {h.etaMinutes && (
                        <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap">
                          ⏱ {h.etaMinutes}min
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {h.hasTraumaCenter && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Trauma Centre</span>}
                      {h.hasICU && <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">ICU</span>}
                      {h.hasBloodBank && <span className="bg-pink-100 text-pink-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Blood Bank</span>}
                      {h.distanceKm != null && <span className="text-[10px] text-gray-400 font-semibold px-1">{h.distanceKm}km away</span>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {h.emergencyPhone && (
                        <a href={`tel:${h.emergencyPhone}`} className="flex-1 py-2 bg-green-50 text-green-700 font-bold rounded-lg text-center text-xs border border-green-200">📞 Call ER</a>
                      )}
                      {h.navigationUrl && (
                        <a href={h.navigationUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg text-center text-xs border border-blue-200">🗺️ Navigate</a>
                      )}
                    </div>
                    {i === 0 && location && h.latitude && (
                      <div className="mt-2 rounded-lg overflow-hidden">
                        <DirectionsMap fromLat={location.lat} fromLng={location.lng} toLat={h.latitude} toLng={h.longitude!} height="140px" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bystander guidance */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">⚡ What to do RIGHT NOW</p>
            <ul className="space-y-2">
              {guidance.map((g, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="flex-shrink-0">{g}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Optional: attach a photo afterwards */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-2">📷 Attach a Photo (Optional)</p>
            <p className="text-xs text-gray-400 mb-2">Not required — family is already notified. Helps police/insurance records.</p>
            {evidenceUploaded ? (
              <p className="text-xs text-green-600 font-bold">✓ Photo attached to incident record</p>
            ) : (
              <label className="flex items-center justify-center gap-2 w-full h-16 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50">
                <span className="text-xl">📷</span>
                <span className="text-gray-500 text-xs font-semibold">Tap to add a photo</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => handleAttachPhoto(e.target.files?.[0] ?? null)} />
              </label>
            )}
          </div>

          {/* Timeline */}
          {eventData?.timeline && eventData.timeline.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">📋 Emergency Timeline</p>
              <div className="space-y-3">
                {eventData.timeline.map((entry, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1" />
                      {i < eventData.timeline!.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[16px]" />}
                    </div>
                    <div className="pb-2 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-tight">{entry.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(entry.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ─── Helpers ─────────────────────────────────────────────────────
function Screen({ children, bg }: { children: React.ReactNode; bg: 'white' | 'red' }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-4 ${bg === 'red' ? 'bg-red-600' : 'bg-white'}`}>
      {children}
    </div>
  )
}

function Spinner({ size = 'md', className = '' }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size]
  return (
    <div className={`${s} border-4 border-current border-t-transparent rounded-full animate-spin ${className || 'text-red-600'}`} />
  )
}
