'use client'
import { useState } from 'react'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { Button, Input, Card, CardHeader, CardTitle, CardDescription, CardContent, Alert, FormField } from '@/components/ui/index'

export default function ForgotPasswordPage() {
  const [tab, setTab] = useState<'email' | 'phone'>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  const handlePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!phone) return
    setLoading(true); setError('')
    try {
      await authApi.forgotPassword(phone) // endpoint handles both
      setSent(true)
    } catch (err) { setError(getErrorMessage(err)) }
    finally { setLoading(false) }
  }

  if (sent) return (
    <Card className="shadow-lg text-center">
      <CardContent className="pt-8 pb-6">
        <div className="text-5xl mb-4">{tab === 'email' ? '📧' : '📱'}</div>
        <h2 className="text-2xl font-black mb-2">{tab === 'email' ? 'Check your email' : 'Check your SMS'}</h2>
        <p className="text-muted-foreground mb-6">
          {tab === 'email'
            ? `A password reset link has been sent to ${email}. It expires in 30 minutes.`
            : `A 6-digit OTP has been sent to ${phone}. It expires in 10 minutes.`}
        </p>
        {tab === 'phone' && (
          <Link href={`/reset-password?mode=phone&phone=${encodeURIComponent(phone)}`}>
            <Button variant="danger" className="w-full mb-3">Enter OTP</Button>
          </Link>
        )}
        <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to login
        </Link>
      </CardContent>
    </Card>
  )

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="text-4xl mb-3">🔐</div>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We'll send you a reset link or OTP</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Tabs */}
        <div className="flex rounded-xl bg-gray-100 p-1 mb-5">
          {(['email', 'phone'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === t ? 'bg-white shadow text-gray-900' : 'text-muted-foreground'}`}>
              {t === 'email' ? '📧 Email' : '📱 Phone'}
            </button>
          ))}
        </div>

        {error && <Alert variant="danger" className="mb-4">{error}</Alert>}

        {tab === 'email' ? (
          <form onSubmit={handleEmail} className="space-y-4">
            <FormField label="Email address" required>
              <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            </FormField>
            <Button type="submit" variant="danger" className="w-full" loading={loading}>Send Reset Link</Button>
          </form>
        ) : (
          <form onSubmit={handlePhone} className="space-y-4">
            <FormField label="Mobile number" required>
              <Input type="tel" placeholder="+919876543210" value={phone} onChange={e => setPhone(e.target.value)} autoFocus />
            </FormField>
            <Button type="submit" variant="danger" className="w-full" loading={loading}>Send OTP</Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground mt-5">
          <Link href="/login" className="text-red-600 font-medium hover:text-red-700">← Back to login</Link>
        </p>
      </CardContent>
    </Card>
  )
}
