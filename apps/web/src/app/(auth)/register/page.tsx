'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authApi } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import {
  Button, Input, Card, CardHeader, CardTitle, CardDescription,
  CardContent, CardFooter, Alert, FormField,
} from '@/components/ui/index'

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
    { label: 'Special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['bg-gray-200', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']

  if (!password) return null
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= score ? colors[score] : 'bg-gray-200'}`} />
        ))}
      </div>
      <p className={`text-xs font-semibold ${score < 2 ? 'text-red-500' : score < 4 ? 'text-yellow-600' : 'text-green-600'}`}>
        Password strength: {labels[score] || '—'}
      </p>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(c => (
          <div key={c.label} className={`text-xs flex items-center gap-1 transition-colors ${c.ok ? 'text-green-600' : 'text-muted-foreground'}`}>
            <span className="font-bold">{c.ok ? '✓' : '○'}</span> {c.label}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(p => ({ ...p, [field]: e.target.value }))
    setFieldErrors(p => ({ ...p, [field]: '' }))
    setError('')
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.fullName.trim() || form.fullName.trim().length < 2)
      errs.fullName = 'Enter your full name (minimum 2 characters)'
    if (!form.email) errs.email = 'Email address is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email address'
    if (form.phone && !/^\+91[6-9]\d{9}$/.test(form.phone))
      errs.phone = 'Enter valid Indian number: +91XXXXXXXXXX (10 digits after +91)'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 8) errs.password = 'Minimum 8 characters'
    else if (!/[A-Z]/.test(form.password)) errs.password = 'Must contain an uppercase letter'
    else if (!/[0-9]/.test(form.password)) errs.password = 'Must contain a number'
    else if (!/[^A-Za-z0-9]/.test(form.password)) errs.password = 'Must contain a special character (!@#$...)'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setLoading(true)
    try {
      await authApi.register({
        fullName: form.fullName.trim(),
        email: form.email.toLowerCase().trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      })
      setSuccess(true)
    } catch (err: any) {
      const msg = err?.response?.data?.message || getErrorMessage(err)
      // Handle specific backend errors
      if (err?.response?.data?.errors) {
        const backendErrors = err.response.data.errors
        const fieldMap: Record<string, string> = {}
        Object.entries(backendErrors).forEach(([key, msgs]) => {
          fieldMap[key] = Array.isArray(msgs) ? (msgs as string[])[0] : String(msgs)
        })
        setFieldErrors(fieldMap)
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <Card className="shadow-lg">
      <CardContent className="pt-10 pb-8 px-8 text-center">
        <div className="text-5xl mb-4">📧</div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Check Your Email!</h2>
        <p className="text-muted-foreground mb-2">
          We sent a verification link to <strong>{form.email}</strong>
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Click the link in the email to activate your account. Check your spam folder if you don't see it.
        </p>
        <Button variant="danger" className="w-full" onClick={() => router.push('/login')}>
          Go to Login →
        </Button>
        <p className="text-xs text-muted-foreground mt-4">
          Already verified?{' '}
          <button onClick={() => router.push('/login')} className="text-red-600 font-semibold underline">
            Sign in now
          </button>
        </p>
      </CardContent>
    </Card>
  )

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🛡️</div>
        <CardTitle className="text-2xl">Create Your Account</CardTitle>
        <CardDescription>Join RoadSafe and protect yourself on every journey</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert variant="danger" title="Registration failed">{error}</Alert>}

          <FormField label="Full Name" required>
            <Input
              placeholder="Ravi Kumar"
              value={form.fullName}
              onChange={set('fullName')}
              error={fieldErrors.fullName}
              autoFocus
              autoComplete="name"
            />
          </FormField>

          <FormField label="Email Address" required>
            <Input
              type="email"
              placeholder="ravi@example.com"
              value={form.email}
              onChange={set('email')}
              error={fieldErrors.email}
              autoComplete="email"
            />
          </FormField>

          <FormField label="Mobile Number">
            <Input
              type="tel"
              placeholder="+919876543210"
              value={form.phone}
              onChange={set('phone')}
              error={fieldErrors.phone}
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Used for SMS emergency alerts. Include country code: +91 followed by 10 digits.
            </p>
          </FormField>

          <FormField label="Password" required>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Create a strong password"
                value={form.password}
                onChange={set('password')}
                error={fieldErrors.password}
                className="pr-11"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground text-lg"
                tabIndex={-1}
                aria-label="Toggle password visibility"
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            <PasswordStrength password={form.password} />
          </FormField>

          <FormField label="Confirm Password" required>
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              error={fieldErrors.confirmPassword}
              autoComplete="new-password"
            />
          </FormField>

          <p className="text-xs text-muted-foreground leading-relaxed">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-red-600 underline">Terms of Service</Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-red-600 underline">Privacy Policy</Link>.
          </p>

          <Button type="submit" className="w-full" variant="danger" size="lg" loading={loading}>
            {loading ? 'Creating Account…' : 'Create Free Account'}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-red-600 font-bold hover:text-red-700">
            Sign in →
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
