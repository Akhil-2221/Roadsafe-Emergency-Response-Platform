'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { getErrorMessage } from '@/lib/utils'
import {
  Button, Input, Card, CardHeader, CardTitle,
  CardDescription, CardContent, CardFooter, Alert, FormField,
} from '@/components/ui/index'

export default function LoginPage() {
  const router = useRouter()
  const { login, isLoading, isAuthenticated } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard')
  }, [isAuthenticated])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!email.trim()) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email'
    if (!password) errs.password = 'Password is required'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    try {
      await login(email.trim().toLowerCase(), password)
      router.replace('/dashboard')
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 401) setError('Incorrect email or password. Please try again.')
      else if (status === 429) setError(err?.response?.data?.message || 'Account temporarily locked. Try again later.')
      else if (status === 403) setError('Your account has been deactivated. Contact support.')
      else setError(getErrorMessage(err))
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="w-14 h-14 bg-red-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">🚨</div>
        <CardTitle className="text-2xl">Welcome Back</CardTitle>
        <CardDescription>Sign in to your RoadSafe account</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {error && <Alert variant="danger">{error}</Alert>}

          <FormField label="Email Address" required>
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setFieldErrors(p => ({ ...p, email: '' })); setError('') }}
              error={fieldErrors.email}
              autoComplete="email"
              autoFocus
            />
          </FormField>

          <FormField label="Password" required>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: '' })); setError('') }}
                error={fieldErrors.password}
                className="pr-11"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground text-lg"
                tabIndex={-1}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </FormField>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
              <span className="text-sm text-muted-foreground">Remember me</span>
            </label>
            <Link href="/forgot-password" className="text-sm text-red-600 font-semibold hover:text-red-700">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full" variant="danger" size="lg" loading={isLoading}>
            {isLoading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          No account?{' '}
          <Link href="/register" className="text-red-600 font-bold hover:text-red-700">Create one free →</Link>
        </p>
        <div className="w-full border-t pt-3 text-center">
          <p className="text-xs text-muted-foreground mb-2">Witnessed an accident right now?</p>
          <Link href="/emergency-lookup"
            className="inline-block px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-bold">
            🔍 Find Vehicle by Number Plate
          </Link>
        </div>
      </CardFooter>
    </Card>
  )
}
