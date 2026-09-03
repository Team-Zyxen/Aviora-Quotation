'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  Loader2,
  FileText,
  CreditCard,
  AlertTriangle,
  Eye,
  EyeOff,
  Plane,
  TrendingUp,
  Lock,
} from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      queryClient.clear()
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden grid grid-cols-1 lg:grid-cols-12 bg-slate-50 font-sans">
      {/* LEFT PANEL: Aviora Aviation Academy Finance System Showcase */}
      <div className="hidden lg:flex lg:col-span-7 xl:col-span-7 flex-col justify-between p-10 xl:p-14 bg-cover bg-center bg-[url('/login-bg.jpg')] text-white relative overflow-hidden font-aeroverse">
        {/* Soft Light Overlay for Optimal Text Readability & Image Vibrancy */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/25 to-slate-950/35 z-0" />

        {/* Top Right Dot Grid Matrix */}
        <div className="absolute top-8 right-8 z-10 grid grid-cols-6 gap-2 opacity-25">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="w-1 h-1 rounded-full bg-white" />
          ))}
        </div>

        {/* Top Header Badge */}
        <div className="relative z-10 space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-2xs font-semibold uppercase tracking-wider bg-slate-950/40 text-slate-200 border border-slate-700/50 backdrop-blur-sm">
            <Plane className="w-3.5 h-3.5 text-amber-400" />
            AVIORA AVIATION ACADEMY • FINANCE SYSTEM
          </div>

          <div className="space-y-1.5">
            {/* Sleek Medium/Semibold Italic Title */}
            <div className="flex items-center tracking-tight font-semibold italic text-4xl sm:text-5xl text-white drop-shadow-sm">
              <span className="font-aeroverse">AERO</span>
              <span className="font-aeroverse text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500">
                VERSE
              </span>
            </div>

            {/* Refined Thin Tagline */}
            <p className="text-2xs sm:text-xs font-medium italic text-amber-300/85 tracking-[0.35em] uppercase pt-0.5">
              PRECISION. TRANSPARENCY. COMPLIANCE.
            </p>

            <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed font-normal max-w-md pt-2">
              An enterprise quotation and financial management portal engineered for pilot training programs. Streamline course quotes, student ledgers, invoicing, and real-time payment tracking.
            </p>
          </div>
        </div>

        {/* 3 Refined Feature Highlight Blocks */}
        <div className="relative z-10 my-4 space-y-4 max-w-lg">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950/40 border border-slate-700/50 flex items-center justify-center shrink-0 text-amber-400 backdrop-blur-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Smart Quotation Engine</h3>
              <p className="text-xs sm:text-sm text-slate-300/80 mt-1 leading-relaxed max-w-sm">
                Generate instant, tailored aviation training quotations with GST breakdowns, custom discounts, and structured payment schedules.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950/40 border border-slate-700/50 flex items-center justify-center shrink-0 text-amber-400 backdrop-blur-sm">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Fee &amp; Student Ledger Tracking</h3>
              <p className="text-xs sm:text-sm text-slate-300/80 mt-1 leading-relaxed max-w-sm">
                Monitor student fee collections, payment receipts, due installments, and individual student financial accounts.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-950/40 border border-slate-700/50 flex items-center justify-center shrink-0 text-amber-400 backdrop-blur-sm">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Financial Analytics &amp; Reports</h3>
              <p className="text-xs sm:text-sm text-slate-300/80 mt-1 leading-relaxed max-w-sm">
                Real-time insights into academy revenue, pending collections, tax summaries, and executive financial reports.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Lock Pill Badge */}
        <div className="relative z-10 pt-1">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-2xs font-medium text-slate-300 bg-slate-950/40 border border-slate-700/50 backdrop-blur-sm">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Bank-Grade Security • Audit-Compliant • Encrypted</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL: Sign In Card Container */}
      <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between p-6 sm:p-10 lg:p-12 bg-slate-50 overflow-y-auto lg:overflow-hidden h-full">
        <div className="w-full max-w-md mx-auto my-auto space-y-6">
          {/* Logo Header */}
          <div className="text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/aviora-logo.png"
              alt="AVIORA AVIATION ACADEMY"
              className="h-32 mx-auto object-contain shrink-0"
            />
            <p className="text-xs font-bold tracking-wider text-gray-500 uppercase text-center mt-2">
              Finance Portal Sign In
            </p>
          </div>

          {/* Floating White Card Container */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-8 space-y-5">
            {/* Error Warning Banner */}
            {error && (
              <div className="bg-amber-50/90 border border-amber-200 text-amber-900 text-xs rounded-xl p-3.5 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            <form className="space-y-4" onSubmit={handleLogin}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="email-address" className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    id="email-address"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm font-sans placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0f4383] focus:border-[#0f4383] shadow-2xs transition-colors"
                    placeholder="student@aviora.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className="w-full rounded-lg border border-gray-200 pl-3.5 pr-10 py-2.5 text-sm font-sans placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0f4383] focus:border-[#0f4383] shadow-2xs transition-colors"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full py-3.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-[#0a1e3f] via-[#0f2c59] to-[#0a1e3f] hover:from-[#071733] hover:via-[#0c234a] hover:to-[#071733] shadow-md hover:shadow-lg shadow-navy-950/25 transition-all duration-300 ease-out cursor-pointer disabled:opacity-50 overflow-hidden flex items-center justify-center hover:scale-[1.01]"
              >
                {/* Light Sweep Shimmer Flare Effect */}
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out pointer-events-none" />

                {loading ? (
                  <div className="flex items-center justify-center gap-2 relative z-10">
                    <Loader2 className="w-4.5 h-4.5 animate-spin text-amber-400" />
                    <span>Taking Off...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2.5 relative z-10">
                    {/* Gold Horizontal Flight Plane Icon with Hover Slide & Click Takeoff to Right End */}
                    <Plane className="w-4.5 h-4.5 text-amber-400 shrink-0 transform rotate-45 group-hover:translate-x-2 group-active:translate-x-36 sm:group-active:translate-x-44 transition-transform duration-300 ease-out drop-shadow-2xs" />
                    <span className="font-semibold text-white tracking-wide">Take Off</span>
                  </div>
                )}
              </button>
            </form>

            <p className="text-2xs font-semibold text-gray-400 text-center pt-1">
              Having trouble? <span className="text-gray-500 hover:underline cursor-pointer">Contact your administrator</span>
            </p>
          </div>

          {/* Right Panel Attribution Footer (Properly Sized ZYXEN Logo) */}
          <div className="text-center space-y-1.5 pt-2">
            <p className="text-2xs font-bold text-gray-700">© AVIORA · Aviation Training Portal</p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <span>Developed &amp; maintained by</span>
              <a
                href="https://zyxen.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-bold text-gray-900 hover:text-[#0f4383] transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/zyxen-logo.png"
                  alt="ZYXEN"
                  className="w-4 h-4 aspect-square object-contain bg-black p-0.5 rounded shrink-0"
                />
                <span className="font-extrabold text-xs">ZYXEN</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
