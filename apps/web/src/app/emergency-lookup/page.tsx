'use client'

import { useState, useCallback, useEffect } from 'react'
import { emergencyApi } from '@/lib/api'
import { DirectionsMap, StaticMap } from '@/components/maps/MapComponents'

type Step = 'SEARCH' | 'CONFIRM' | 'PERMISSIONS' | 'CAPTURE' | 'UPLOADING' | 'VERIFYING' | 'ACTIVE' | 'ERROR'

interface FoundVehicle {
  id: string
  vehicleNumber: string
  vehicleType: string
  make?: string
  model?: string
  color?: string
  qrCodeId?: string
  accessMethod: 'PLATE_SEARCH' | 'MOBILE_SEARCH'
}

export default function EmergencyLookupPage() {
  const [step, setStep] = useState<Step>('SEARCH')
  const [searchType, setSearchType] = useState<'plate' | 'mobile'>('plate')
  const [plateInput, setPlateInput] = useState('')
  const [mobileInput, setMobileInput] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [vehicle, setVehicle] = useState<FoundVehicle | null>(null)

  // Capture state
  const [bystanderName, setBystanderName] = useState('')
  const [bystanderPhone, setBystanderPhone] = useState('')
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy?: number } | null>(null)
  const [accidentPhoto, setAccidentPhoto] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [accidentPreview, setAccidentPreview] = useState<string | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  // Event state
  const [eventId, setEventId] = useState('')
  const [incidentId, setIncidentId] = useState('')
  const [shareToken, setShareToken] = useState('')
  const [eventData, setEventData] = useState<any>(null)
  const [error, setError] = useState('')
  const [locationUpdates, setLocationUpdates] = useState(0)

  // Declaration of physical presence — required before submitting
  const [declarationAccepted, setDeclarationAccepted] = useState(false)

  // Bystander OTP verification (only enforced if server requires it)
  const [requireOtp, setRequireOtp] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')

  // Fetch whether bystander OTP verification is required
  useEffect(() => {
    emergencyApi.getConfig()
      .then(({ data }) => setRequireOtp(!!data?.data?.requireBystanderOtp))
      .catch(() => setRequireOtp(false))
  }, [])

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
      setError('')
    } catch (err: any) {
      setOtpError(err?.response?.data?.message || 'Incorrect code')
    } finally {
      setOtpVerifying(false)
    }
  }

  // ─── Search ────────────────────────────────────────────────────
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setSearchError('')
    const query = searchType === 'plate' ? plateInput.trim().toUpperCase() : mobileInput.trim()
    if (!query) { setSearchError('Please enter a ' + (searchType === 'plate' ? 'vehicle number' : 'mobile number')); return }

    setSearching(true)
    try {
      const { data } = await emergencyApi.lookupVehicle(
        searchType === 'plate' ? { vehicleNumber: query } : { mobile: query }
      )
      setVehicle(data.data)
      setStep('CONFIRM')
    } catch (err: any) {
      setSearchError(err?.response?.data?.message || 'Vehicle not found. Ensure the number plate is registered on RoadSafe.')
    } finally {
      setSearching(false)
    }
  }

  // ─── Get GPS ───────────────────────────────────────────────────
  const requestLocation = useCallback(() => {
    setStep('PERMISSIONS')
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setStep('CAPTURE')
      },
      () => {
        setError('GPS permission required. Please enable location access.')
        setStep('ERROR')
      },
      { enableHighAccuracy: true, timeout: 20000 }
    )
  }, [])

  // ─── File handlers ─────────────────────────────────────────────
  const handleFile = (file: File | null, type: 'accident' | 'selfie') => {
    if (!file) return
    const url = URL.createObjectURL(file)
    if (type === 'accident') { setAccidentPhoto(file); setAccidentPreview(url) }
    else { setSelfie(file); setSelfiePreview(url) }
  }

  // ─── Submit emergency ──────────────────────────────────────────
  const submitEmergency = async () => {
    if (!location || !vehicle) return
    if (!declarationAccepted) {
      setError('Please confirm you are physically present at the accident scene')
      return
    }
    if (requireOtp && !otpVerified) {
      setError('Please verify your mobile number before reporting')
      return
    }
    setUploading(true); setStep('UPLOADING')
    try {
      const { data: startData } = await emergencyApi.startEvent({
        vehicleId: vehicle.id,
        qrCodeId: vehicle.qrCodeId,
        accessMethod: vehicle.accessMethod,
        bystanderName: bystanderName.trim() || undefined,
        bystanderPhone: bystanderPhone.trim() || undefined,
        latitude: location.lat,
        longitude: location.lng,
        locationAccuracy: location.accuracy,
        declarationAccepted: true,
        bystanderOtpVerified: otpVerified,
      })
      const { eventId: evId, incidentId: iId, shareToken: sToken } = startData.data
      setEventId(evId); setIncidentId(iId); setShareToken(sToken)

      const fd = new FormData()
      if (accidentPhoto) fd.append('accidentPhoto', accidentPhoto)
      if (selfie) fd.append('selfie', selfie)
      await emergencyApi.uploadEvidence(evId, fd)
      setStep('VERIFYING')

      // Start SSE
      const es = new EventSource(emergencyApi.getStreamUrl(evId))
      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'status' && msg.data) {
            setEventData(msg.data)
            if (['ACTIVE', 'VERIFIED'].includes(msg.data.status)) setStep('ACTIVE')
          }
        } catch {}
      }
      es.onerror = () => {
        es.close()
        // Fall back to polling
        const iv = setInterval(async () => {
          try {
            const { data } = await emergencyApi.getStatus(evId)
            setEventData(data.data)
            if (['ACTIVE', 'VERIFIED'].includes(data.data.status)) { clearInterval(iv); setStep('ACTIVE') }
          } catch {}
        }, 5000)
      }

      // Live location every 30s
      setInterval(async () => {
        setLocation(loc => {
          if (loc) { emergencyApi.updateLocation(evId, loc.lat, loc.lng).catch(() => {}); setLocationUpdates(n => n + 1) }
          return loc
        })
      }, 30000)

    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to report. Please call 112 directly.')
      setStep('ERROR')
    } finally {
      setUploading(false)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  if (step === 'SEARCH') return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-red-600 px-5 py-6 text-white text-center">
        <div className="text-4xl mb-2">🔍</div>
        <h1 className="text-2xl font-black">Emergency Vehicle Lookup</h1>
        <p className="text-red-100 text-sm mt-1">QR code damaged or missing? Search by number plate or mobile.</p>
      </div>

      <div className="max-w-sm mx-auto px-5 py-6 space-y-5">
        {/* Prominent 112 CTA */}
        <a href="tel:112" className="block w-full py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center shadow">
          📞 Call 112 First — National Emergency
        </a>

        <div className="relative flex items-center">
          <div className="flex-1 border-t border-gray-200" />
          <p className="px-3 text-xs text-gray-400 font-semibold">ALSO ALERT VICTIM'S FAMILY</p>
          <div className="flex-1 border-t border-gray-200" />
        </div>

        {/* Tab */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setSearchType('plate')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${searchType === 'plate' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            🚗 Vehicle Number
          </button>
          <button
            onClick={() => setSearchType('mobile')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${searchType === 'mobile' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            📱 Mobile Number
          </button>
        </div>

        <form onSubmit={handleSearch} className="space-y-4">
          {searchType === 'plate' ? (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Vehicle Registration Number <span className="text-red-500">*</span>
              </label>
              <input
                value={plateInput}
                onChange={e => setPlateInput(e.target.value.toUpperCase())}
                placeholder="e.g. TS09EA1234"
                className="w-full h-14 px-4 text-2xl font-black tracking-widest border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-500 uppercase text-center"
                autoCapitalize="characters"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Enter the number plate exactly as displayed on the vehicle</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Registered Mobile Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={mobileInput}
                onChange={e => setMobileInput(e.target.value)}
                placeholder="+919876543210"
                className="w-full h-14 px-4 text-xl border-2 border-gray-200 rounded-xl focus:outline-none focus:border-red-500"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">The mobile number registered by the vehicle owner on RoadSafe</p>
            </div>
          )}

          {searchError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {searchError}
              <p className="mt-1 text-xs font-semibold">
                If the vehicle is not registered, please call 112 directly.
              </p>
            </div>
          )}

          <button type="submit" disabled={searching}
            className="w-full py-4 bg-red-600 text-white font-black text-lg rounded-2xl disabled:opacity-50 shadow-lg active:scale-95 transition-transform">
            {searching ? '🔍 Searching…' : '🔍 Find Vehicle & Alert Family'}
          </button>
        </form>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-800 mb-1">💡 How this helps</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Once found, we will immediately alert the victim's registered family contacts via SMS and WhatsApp with your location, the incident ID, and a live tracking link.
          </p>
        </div>
      </div>
    </div>
  )

  if (step === 'CONFIRM' && vehicle) return (
    <div className="min-h-screen bg-white">
      <div className="bg-orange-500 px-5 py-5 text-white text-center">
        <p className="text-xs uppercase tracking-widest opacity-80">Vehicle Found</p>
        <h1 className="text-3xl font-black tracking-wider">{vehicle.vehicleNumber}</h1>
      </div>

      <div className="max-w-sm mx-auto px-5 py-6 space-y-4">
        <div className="bg-gray-50 rounded-2xl p-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-widest mb-3">Vehicle Details</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><p className="text-gray-400 text-xs">Type</p><p className="font-bold">{vehicle.vehicleType}</p></div>
            {vehicle.make && <div><p className="text-gray-400 text-xs">Make</p><p className="font-bold">{vehicle.make}</p></div>}
            {vehicle.model && <div><p className="text-gray-400 text-xs">Model</p><p className="font-bold">{vehicle.model}</p></div>}
            {vehicle.color && <div><p className="text-gray-400 text-xs">Color</p><p className="font-bold">{vehicle.color}</p></div>}
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <p className="text-sm font-bold text-red-800 mb-1">⚠️ Is this the vehicle involved in the accident?</p>
          <p className="text-xs text-red-700">
            Only confirm if you are certain. This will trigger an emergency alert to the owner's family.
          </p>
        </div>

        <button onClick={requestLocation}
          className="w-full py-5 bg-red-600 text-white font-black text-lg rounded-2xl shadow-xl active:scale-95 transition-transform">
          ✅ YES — This is the Vehicle. Report Emergency
        </button>

        <button onClick={() => { setStep('SEARCH'); setVehicle(null) }}
          className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-2xl">
          ← No, Search Again
        </button>
      </div>
    </div>
  )

  if (step === 'PERMISSIONS') return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">📍</div>
      <h2 className="text-xl font-black">Getting Your Location…</h2>
      <p className="text-gray-500 text-sm mt-2 max-w-xs">Please allow GPS — this tells emergency services exactly where the accident is.</p>
      <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mt-6" />
    </div>
  )

  if (step === 'CAPTURE') return (
    <div className="min-h-screen bg-white pb-8">
      <div className="bg-red-600 px-5 py-4 text-white">
        <p className="text-xs opacity-70">Emergency Report — {vehicle?.vehicleNumber}</p>
        <h1 className="text-xl font-black">Capture Evidence</h1>
        {location && <p className="text-red-200 text-xs mt-0.5">📍 GPS acquired ±{Math.round(location.accuracy || 0)}m</p>}
      </div>

      <div className="max-w-sm mx-auto px-4 mt-5 space-y-5">
        {/* Accident photo */}
        <div>
          <p className="text-sm font-black text-gray-900 mb-1">📷 Accident Photo <span className="text-red-500">*</span></p>
          {accidentPreview
            ? <div className="relative">
                <img src={accidentPreview} className="w-full h-52 object-cover rounded-2xl" alt="Accident" />
                <button onClick={() => { setAccidentPhoto(null); setAccidentPreview(null) }}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-600 text-white rounded-full font-black flex items-center justify-center shadow">×</button>
              </div>
            : <label className="flex flex-col items-center justify-center gap-2 w-full h-44 border-2 border-dashed border-red-300 rounded-2xl cursor-pointer bg-red-50">
                <span className="text-4xl">📷</span>
                <span className="text-red-600 font-bold text-sm">Tap to take photo</span>
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => handleFile(e.target.files?.[0] ?? null, 'accident')} />
              </label>
          }
        </div>

        {/* Selfie */}
        <div>
          <p className="text-sm font-bold text-gray-700 mb-1">🤳 Your Selfie <span className="text-gray-400 font-normal">(optional)</span></p>
          {selfiePreview
            ? <div className="relative">
                <img src={selfiePreview} className="w-full h-32 object-cover rounded-xl" alt="Selfie" />
                <button onClick={() => { setSelfie(null); setSelfiePreview(null) }}
                  className="absolute top-2 right-2 w-7 h-7 bg-red-600 text-white rounded-full font-black flex items-center justify-center">×</button>
              </div>
            : <label className="flex items-center justify-center gap-3 w-full h-24 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer bg-gray-50">
                <span className="text-2xl">🤳</span>
                <span className="text-gray-500 text-sm">Take selfie for identity</span>
                <input type="file" accept="image/*" capture="user" className="hidden"
                  onChange={e => handleFile(e.target.files?.[0] ?? null, 'selfie')} />
              </label>
          }
        </div>

        {/* Bystander contact */}
        <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
            Your Contact {requireOtp ? <span className="text-red-500">(Required)</span> : '(Optional)'}
          </p>
          <input value={bystanderName} onChange={e => setBystanderName(e.target.value)}
            placeholder="Your name"
            className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500" />
          <div className="flex gap-2">
            <input value={bystanderPhone}
              onChange={e => { setBystanderPhone(e.target.value); setOtpVerified(false); setOtpSent(false) }}
              placeholder="+91XXXXXXXXXX" type="tel"
              disabled={otpVerified}
              className="flex-1 h-11 px-4 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500 disabled:bg-green-50 disabled:border-green-300" />
            {requireOtp && !otpVerified && (
              <button type="button" onClick={handleSendOtp} disabled={otpSending || !bystanderPhone.trim()}
                className="px-4 h-11 bg-red-600 text-white text-xs font-bold rounded-xl whitespace-nowrap disabled:opacity-50">
                {otpSending ? '…' : otpSent ? 'Resend' : 'Send Code'}
              </button>
            )}
          </div>
          {requireOtp && otpSent && !otpVerified && (
            <div className="flex gap-2">
              <input
                value={otpCode}
                onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className="flex-1 h-11 px-4 border border-gray-200 rounded-xl text-sm tracking-widest font-bold bg-white focus:outline-none focus:ring-2 focus:ring-red-500" />
              <button type="button" onClick={handleVerifyOtp} disabled={otpVerifying || otpCode.length !== 6}
                className="px-4 h-11 bg-green-600 text-white text-xs font-bold rounded-xl whitespace-nowrap disabled:opacity-50">
                {otpVerifying ? '…' : 'Verify'}
              </button>
            </div>
          )}
          {requireOtp && otpVerified && (
            <p className="text-xs text-green-600 font-bold">✓ Mobile number verified</p>
          )}
          {otpError && <p className="text-xs text-red-500">{otpError}</p>}
        </div>

        {/* Physical presence declaration — required */}
        <label className="flex items-start gap-3 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 cursor-pointer">
          <input
            type="checkbox"
            checked={declarationAccepted}
            onChange={e => { setDeclarationAccepted(e.target.checked); setError('') }}
            className="mt-0.5 w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
          />
          <span className="text-sm text-yellow-900">
            <span className="font-bold">I confirm I am physically present</span> at the accident scene right now and the information I provide is accurate.
          </span>
        </label>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
            ⚠️ {error}
          </div>
        )}

        <button onClick={submitEmergency}
          disabled={!accidentPhoto || uploading || !declarationAccepted || (requireOtp && !otpVerified)}
          className="w-full py-5 bg-red-600 text-white font-black text-xl rounded-2xl disabled:opacity-40 shadow-xl active:scale-95 transition-transform">
          🚨 REPORT EMERGENCY
        </button>
      </div>
    </div>
  )

  if (step === 'UPLOADING') return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4" />
      <h2 className="text-xl font-black">Uploading Evidence…</h2>
      <p className="text-gray-500 text-sm mt-2">Please wait. Do NOT close this page.</p>
    </div>
  )

  if (step === 'VERIFYING') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 text-center">
      <div className="relative w-24 h-24 mb-5">
        <div className="absolute inset-0 border-4 border-red-100 rounded-full" />
        <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-3xl">🤖</span>
      </div>
      <h2 className="text-2xl font-black">AI Verifying…</h2>
      <p className="text-gray-500 text-sm mt-2">Alerting victim's family while analyzing the scene.</p>
      {incidentId && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-5 py-3">
          <p className="text-xs text-red-600 font-semibold">Incident ID</p>
          <p className="font-black text-red-700 text-xl">{incidentId}</p>
        </div>
      )}
      <a href="tel:112" className="mt-6 w-full max-w-sm py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center block">
        📞 Call 112 While Waiting
      </a>
    </div>
  )

  if (step === 'ACTIVE' && eventData) return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-orange-500 px-5 py-5 text-white">
        <div className="max-w-sm mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs uppercase opacity-70">Emergency Active</p>
            <h1 className="text-2xl font-black">🔴 {eventData.aiSeverity || 'HIGH'}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs opacity-70">Incident ID</p>
            <p className="font-black text-sm">{incidentId}</p>
          </div>
        </div>
      </div>

      <div className="max-w-sm mx-auto px-4 space-y-4 mt-4">
        <a href="tel:112" className="block w-full py-5 bg-red-600 text-white font-black text-xl rounded-2xl text-center shadow">
          📞 Call 112
        </a>

        {shareToken && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-blue-700 mb-1">📡 Share Tracking Link with Family</p>
            <div className="flex gap-2">
              <input readOnly value={`${window.location.origin}/track/${shareToken}`}
                className="flex-1 text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 font-mono text-blue-800" />
              <button onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/track/${shareToken}`)}
                className="px-3 bg-blue-600 text-white text-xs font-bold rounded-lg">Copy</button>
            </div>
          </div>
        )}

        {eventData.hospital && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-2">🏥 Nearest Hospital</p>
            <p className="font-black text-gray-900 text-lg">{eventData.hospital.name}</p>
            <p className="text-gray-500 text-sm">{eventData.hospital.address}</p>
            {eventData.hospitalEtaMinutes && (
              <p className="text-orange-600 font-bold mt-1">ETA: ~{eventData.hospitalEtaMinutes} min</p>
            )}
            {eventData.hospital.latitude && location && (
              <div className="mt-3 rounded-xl overflow-hidden">
                <DirectionsMap
                  fromLat={location.lat} fromLng={location.lng}
                  toLat={eventData.hospital.latitude} toLng={eventData.hospital.longitude}
                  height="160px"
                />
              </div>
            )}
            {eventData.hospitalRouteUrl && (
              <a href={eventData.hospitalRouteUrl} target="_blank" rel="noopener noreferrer"
                className="block mt-3 py-3 bg-blue-50 text-blue-700 font-bold rounded-xl text-center text-sm">
                🗺️ Get Directions to Hospital
              </a>
            )}
          </div>
        )}

        {eventData.timeline?.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs uppercase tracking-widest text-gray-400 font-semibold mb-3">📋 Timeline</p>
            {eventData.timeline.map((e: any, i: number) => (
              <div key={i} className="flex gap-3 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{e.description}</p>
                  <p className="text-xs text-gray-400">{new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  if (step === 'ERROR') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-xl font-black text-gray-900 mb-2">Error</h2>
      <p className="text-gray-500 text-sm mb-6">{error}</p>
      <a href="tel:112" className="block w-full max-w-sm py-4 bg-red-600 text-white font-black text-lg rounded-2xl text-center mb-3">📞 Call 112</a>
      <button onClick={() => setStep('SEARCH')} className="text-sm text-gray-500 underline">← Try Again</button>
    </div>
  )

  return null
}
