import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Token management ─────────────────────────────────────────────
function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('access_token')
}
export function setAccessToken(token: string): void {
  if (typeof window !== 'undefined') localStorage.setItem('access_token', token)
}
function clearTokens(): void {
  if (typeof window !== 'undefined') localStorage.removeItem('access_token')
}

// ─── Attach token on every request ───────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Auto-refresh on 401 ─────────────────────────────────────────
let isRefreshing = false
let failedQueue: Array<{ resolve: Function; reject: Function }> = []

function processQueue(error: AxiosError | null, token: string | null = null) {
  failedQueue.forEach(p => (error ? p.reject(error) : p.resolve(token)))
  failedQueue = []
}

api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const original = error.config as any
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => failedQueue.push({ resolve, reject }))
          .then(token => { original.headers.Authorization = `Bearer ${token}`; return api(original) })
      }
      original._retry = true
      isRefreshing = true
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
        const newToken = data.data.accessToken
        setAccessToken(newToken)
        processQueue(null, newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshError) {
        processQueue(refreshError as AxiosError, null)
        clearTokens()
        if (typeof window !== 'undefined') window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ─────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { fullName: string; email: string; phone?: string; password: string }) =>
    api.post('/api/auth/register', data),
  login: async (data: { email: string; password: string }) => {
    const res = await api.post('/api/auth/login', data)
    setAccessToken(res.data.data.accessToken)
    return res.data
  },
  logout: async () => { await api.post('/api/auth/logout'); clearTokens() },
  me: () => api.get('/api/auth/me'),
  verifyEmail: (token: string) => api.post('/api/auth/verify-email', { token }),
  sendOtp: (phone: string, purpose: string) => api.post('/api/auth/send-otp', { phone, purpose }),
  verifyOtp: (phone: string, code: string, purpose: string) =>
    api.post('/api/auth/verify-otp', { phone, code, purpose }),
  forgotPassword: (email: string) => api.post('/api/auth/forgot-password', { email }),
  forgotPasswordPhone: (phone: string) => api.post('/api/auth/forgot-password/phone', { phone }),
  resetPassword: (userId: string, token: string, password: string) =>
    api.post('/api/auth/reset-password', { userId, token, password }),
  resetPasswordPhone: (phone: string, otp: string, password: string) =>
    api.post('/api/auth/reset-password/phone', { phone, otp, password }),
}

// ─── Profile ──────────────────────────────────────────────────────
export const profileApi = {
  get: () => api.get('/api/profile'),
  update: (data: any) => api.put('/api/profile', data),
  uploadPhoto: (file: File) => {
    const fd = new FormData(); fd.append('photo', file)
    return api.post('/api/profile/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getContacts: () => api.get('/api/profile/emergency-contacts'),
  addContact: (data: any) => api.post('/api/profile/emergency-contacts', data),
  updateContact: (id: string, data: any) => api.put(`/api/profile/emergency-contacts/${id}`, data),
  deleteContact: (id: string) => api.delete(`/api/profile/emergency-contacts/${id}`),
}

// ─── Vehicles ────────────────────────────────────────────────────
export const vehicleApi = {
  list: () => api.get('/api/vehicles'),
  create: (data: any) => api.post('/api/vehicles', data),
  update: (id: string, data: any) => api.put(`/api/vehicles/${id}`, data),
  delete: (id: string) => api.delete(`/api/vehicles/${id}`),
  generateQr: (id: string) => api.post(`/api/vehicles/${id}/generate-qr`),
  generateParkingQr: (id: string) => api.post(`/api/vehicles/${id}/generate-parking-qr`),
}

// ─── Emergency ───────────────────────────────────────────────────
export const emergencyApi = {
  // Feature flag — whether bystander OTP verification is required
  getConfig: () => api.get('/api/emergency/config'),

  // Step 1A: QR scan
  scanQr: (qrToken: string) => api.post(`/api/emergency/scan/${qrToken}`),

  // Step 1B: Alternate — damaged QR / no QR
  lookupVehicle: (data: { vehicleNumber?: string; mobile?: string }) =>
    api.post('/api/emergency/lookup', data),

  // Step 1.5 (optional): bystander phone verification
  sendOtp: (phone: string) => api.post('/api/emergency/otp/send', { phone }),
  verifyOtp: (phone: string, code: string) => api.post('/api/emergency/otp/verify', { phone, code }),

  // Step 2: Create event
  startEvent: (data: {
    vehicleId?: string
    qrCodeId?: string
    accessMethod?: string
    bystanderName?: string
    bystanderPhone?: string
    latitude: number
    longitude: number
    locationAccuracy?: number
    declarationAccepted: boolean
    bystanderOtpVerified?: boolean
  }) => api.post('/api/emergency/start', data),

  // Step 3: THE quick reveal — medical info + emergency contacts + nearby
  // hospitals in one call, available immediately after OTP auth.
  revealEmergency: (eventId: string) => api.get(`/api/emergency/${eventId}/reveal`),

  // Optional: attach accident photos afterwards (never blocks the reveal above)
  uploadEvidence: (eventId: string, formData: FormData) =>
    api.post(`/api/emergency/${eventId}/evidence`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Live location update (called every 30s while bystander is on page)
  updateLocation: (eventId: string, latitude: number, longitude: number, accuracy?: number) =>
    api.post(`/api/emergency/${eventId}/location`, { latitude, longitude, accuracy }),

  // Polling (fallback)
  getStatus: (eventId: string) => api.get(`/api/emergency/${eventId}/status`),

  // SSE stream URL (used with EventSource)
  getStreamUrl: (eventId: string) => `${API_URL}/api/emergency/${eventId}/status/stream`,

  // Medical passport
  getMedical: (eventId: string) => api.get(`/api/emergency/${eventId}/medical`),

  // Hospital
  getHospital: (eventId: string) => api.get(`/api/emergency/${eventId}/hospital`),

  // Timeline
  getTimeline: (eventId: string) => api.get(`/api/emergency/${eventId}/timeline`),

  // Family tracking
  getByShareToken: (shareToken: string) => api.get(`/api/emergency/track/${shareToken}`),
  getMedicalByShareToken: (shareToken: string) =>
    api.get(`/api/emergency/track/${shareToken}/medical`),

  // Owner: I'm OK
  confirmOk: (eventId: string) => api.post(`/api/emergency/${eventId}/ok`),

  // Owner: my history
  myEvents: () => api.get('/api/emergency/my/events'),
}

// ─── Hospitals ───────────────────────────────────────────────────
export const hospitalApi = {
  nearby: (lat: number, lng: number, radiusKm = 30) =>
    api.get(`/api/hospitals/nearby?lat=${lat}&lng=${lng}&radius=${radiusKm}`),
  get: (id: string) => api.get(`/api/hospitals/${id}`),

  // Live Google Places search — supplements the curated DB list, useful
  // outside seeded cities or as a richer fallback when DB coverage is thin.
  nearbyLive: (lat: number, lng: number) =>
    api.get(`/api/hospitals/nearby-live?lat=${lat}&lng=${lng}`),

  // Nearest police stations — for FIR filing guidance shown to family/bystanders
  policeNearby: (lat: number, lng: number) =>
    api.get(`/api/hospitals/police/nearby?lat=${lat}&lng=${lng}`),

  // Human-readable address for an accident location
  reverseGeocode: (lat: number, lng: number) =>
    api.get(`/api/hospitals/reverse-geocode?lat=${lat}&lng=${lng}`),
}
