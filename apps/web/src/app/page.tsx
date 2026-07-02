import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-xl flex items-center justify-center text-white font-black text-sm">🚨</div>
          <span className="font-black text-gray-900">RoadSafe Emergency</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">Sign In</Link>
          <Link href="/register" className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition">
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-red-50 text-red-700 rounded-full px-4 py-2 text-sm font-semibold mb-6">
          🚨 Emergency Response Platform for India
        </div>
        <h1 className="text-5xl font-black text-gray-900 leading-tight mb-6">
          When seconds matter,<br />
          <span className="text-red-600">RoadSafe saves lives</span>
        </h1>
        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          Secure QR identity for your vehicle. When an accident happens, a bystander scans the QR —
          your family is alerted, your medical info is shared with responders, and the best hospital is found.
          All in under 60 seconds.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link href="/register" className="px-8 py-4 bg-red-600 text-white rounded-2xl font-black text-lg hover:bg-red-700 transition shadow-lg">
            Register Your Vehicle
          </Link>
          <Link href="/login" className="px-8 py-4 bg-gray-100 text-gray-900 rounded-2xl font-bold text-lg hover:bg-gray-200 transition">
            Sign In
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center text-gray-900 mb-12">How it works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '1', icon: '📱', title: 'Get Your QR', desc: 'Register your vehicle and download your unique encrypted QR sticker. Stick it on your windshield.' },
              { step: '2', icon: '🔍', title: 'Bystander Scans', desc: 'If you\'re in an accident, any bystander scans the QR. No app needed. Works on any smartphone.' },
              { step: '3', icon: '🚑', title: 'Help Arrives Faster', desc: 'Family is alerted via SMS & WhatsApp, medical info is shared with responders, nearest hospital is found.' },
            ].map(item => (
              <div key={item.step} className="bg-white rounded-2xl p-6 shadow-sm">
                <div className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-black text-lg mb-4">{item.step}</div>
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-black text-lg text-gray-900 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-black text-center text-gray-900 mb-12">Everything you need</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: '🔐', label: 'Encrypted QR' },
              { icon: '🤖', label: 'AI Verification' },
              { icon: '🩺', label: 'Medical Passport' },
              { icon: '📲', label: 'SMS + WhatsApp' },
              { icon: '🏥', label: 'Hospital Finder' },
              { icon: '📍', label: 'Live Location' },
              { icon: '📋', label: 'Event Timeline' },
              { icon: '🅿️', label: 'Parking Mode' },
            ].map(f => (
              <div key={f.label} className="bg-gray-50 rounded-xl p-4 text-center">
                <div className="text-2xl mb-2">{f.icon}</div>
                <p className="text-sm font-semibold text-gray-700">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-red-600 py-16 px-6 text-center">
        <h2 className="text-3xl font-black text-white mb-4">Protect yourself today. It's free.</h2>
        <p className="text-red-100 mb-8 text-lg">Join RoadSafe and make every journey safer for you and your family.</p>
        <Link href="/register" className="inline-block px-10 py-4 bg-white text-red-600 rounded-2xl font-black text-lg hover:bg-red-50 transition shadow-lg">
          Create Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-muted-foreground">
        <p>© 2025 RoadSafe Emergency. Made in India. 🇮🇳</p>
      </footer>
    </div>
  )
}
