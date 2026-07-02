import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex flex-col">
      {/* Header */}
      <div className="p-6">
        <Link href="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-xl flex items-center justify-center text-white font-black">🚨</div>
          <span className="font-black text-gray-900">RoadSafe Emergency</span>
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 text-center text-xs text-muted-foreground">
        © 2025 RoadSafe Emergency. Saving lives on the road.
      </div>
    </div>
  )
}
