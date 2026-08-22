'use client'

import React, { useState } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { TopBar } from '@/components/layout/TopBar'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop Sidebar (hidden on mobile, flex on md+) */}
      <div className="hidden md:flex h-full shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer Body */}
          <div className="relative flex w-4/5 max-w-xs flex-1 flex-col bg-white shadow-2xl z-10">
            <Sidebar onMobileNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Right Column Layout */}
      <div className="flex w-0 flex-1 flex-col overflow-hidden">
        <TopBar onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        <main className="relative flex-1 overflow-y-auto focus:outline-none flex flex-col">
          <div className="py-4 px-3 sm:py-6 sm:px-6 lg:px-8 flex-1 flex flex-col justify-between min-h-[calc(100vh-4rem)]">
            <div className="flex-1">{children}</div>
            <footer className="mt-auto pt-6 pb-2 text-center text-xs text-gray-500 shrink-0 border-t border-gray-200/80">
              <div className="flex items-center justify-center gap-1.5">
                <span>Developed &amp; maintained by</span>
                <a
                  href="https://zyxen.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-navy-800 hover:text-navy-950 hover:underline transition-colors"
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
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
