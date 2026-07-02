'use client'
import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, FormField } from '@/components/ui/index'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const mode = params.get('mode') // 'phone' or null (email)
  const phone = params.get('phone') || ''
  const userId = params.get('id') || ''
  const token = params.get('token') || ''

  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const validate = () => {
    if (mode === 'phone' && otp.length !== 6) { setError('Enter the 6-digit OTP'); return false }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return false }
    if (!/[A-Z]/.test(password)) { setError('Password must contain an uppercase letter'); return false }
    if (!/[0-9]/.test(password)) { setError('Password must contain a number'); return false }
    if (!/[^A-Za-z0-9]/.test(password)) { setError('Password must contain a special character'); return false }
    if (password !== confirm) { setError('Passwords do not match'); return false }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === 'phone') {
        // Phone OTP reset
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/reset-password/phone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, otp, password }),
        })
        if (!res.ok) { const d = await res.json(); throw new Error(d.message) }
      } else {
        await authApi.resetPassword(userId, token, password)
      }
      setDone(true)
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  if (done) return (
    <Card className="shadow-lg text-center">
      <CardContent className="pt-8 pb-6">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-black mb-2">Password reset!</h2>
        <p className="text-muted-foreground mb-6">Your password has been updated. All active sessions have been signed out.</p>
        <Button variant="danger" className="w-full" onClick={() => router.push('/login')}>Sign In Now</Button>
      </CardContent>
    </Card>
  )

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="text-4xl mb-3">🔑</div>
        <CardTitle>Set new password</CardTitle>
        <CardDescription>
          {mode === 'phone' ? `Enter the OTP sent to ${phone}` : 'Choose a strong new password'}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          {mode === 'phone' && (
            <FormField label="6-digit OTP" required>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl font-bold tracking-widest"
                autoFocus
              />
            </FormField>
          )}

          <FormField label="New Password" required>
            <div className="relative">
              <Input
                type={showPwd ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pr-11"
              />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-3 top-3 text-muted-foreground" tabIndex={-1}>
                {showPwd ? '🙈' : '👁️'}
              </button>
            </div>
          </FormField>

          <FormField label="Confirm Password" required>
            <Input type={showPwd ? 'text' : 'password'} placeholder="Re-enter new password" value={confirm} onChange={e => setConfirm(e.target.value)} />
          </FormField>

          <Button type="submit" variant="danger" className="w-full" loading={loading}>Reset Password</Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/login" className="text-red-600 font-medium">← Back to login</Link>
        </p>
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return <Suspense><ResetForm /></Suspense>
}
