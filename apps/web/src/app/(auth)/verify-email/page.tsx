'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { Card, CardContent, Spinner } from '@/components/ui/index'

function VerifyContent() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token')
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Missing verification token.'); return }
    authApi.verifyEmail(token)
      .then(() => { setStatus('success'); setTimeout(() => router.replace('/login'), 3000) })
      .catch((err: any) => {
        setStatus('error')
        setMessage(err?.response?.data?.message || 'Verification failed. The link may have expired.')
      })
  }, [token])

  return (
    <Card className="shadow-lg text-center">
      <CardContent className="pt-10 pb-8 px-8">
        {status === 'loading' && (
          <>
            <Spinner className="w-10 h-10 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold">Verifying your email…</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-2xl font-black mb-2">Email Verified!</h2>
            <p className="text-muted-foreground">Your account is now active. Redirecting to login…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-2xl font-black mb-2">Verification Failed</h2>
            <p className="text-muted-foreground mb-6">{message}</p>
            <Link href="/login" className="inline-block px-6 py-3 bg-red-600 text-white rounded-xl font-bold">
              Back to Login
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-red-600" /></div>}><VerifyContent /></Suspense>
}
