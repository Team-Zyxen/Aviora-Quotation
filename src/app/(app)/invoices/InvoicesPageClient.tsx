'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InvoiceList } from './InvoiceList'
import { CompanyInvoiceList } from './CompanyInvoiceList'
import { GraduationCap, Building2 } from 'lucide-react'

interface InvoicesPageClientProps {
  initialTab?: string | null
}

export function InvoicesPageClient({ initialTab }: InvoicesPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTabParam = searchParams.get('tab')

  const [activeTab, setActiveTab] = useState<'student' | 'company'>(
    (currentTabParam || initialTab) === 'company' ? 'company' : 'student'
  )

  const handleTabChange = (tab: 'student' | 'company') => {
    setActiveTab(tab)
    const newParams = new URLSearchParams(searchParams.toString())
    if (tab === 'company') {
      newParams.set('tab', 'company')
    } else {
      newParams.delete('tab')
    }
    const queryStr = newParams.toString()
    router.replace(`/invoices${queryStr ? `?${queryStr}` : ''}`)
  }

  return (
    <div className="space-y-6">
      {/* Top Invoice Category Navigation Tabs */}
      <div className="bg-white border border-gray-200 rounded-xl p-1.5 inline-flex shadow-xs gap-1">
        <button
          type="button"
          onClick={() => handleTabChange('student')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'student'
              ? 'bg-navy-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <GraduationCap className="w-4 h-4" />
          <span>Student Invoices</span>
          <span className="text-2xs opacity-80 font-normal hidden sm:inline">
            (Academic Fee Ledgers)
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('company')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === 'company'
              ? 'bg-navy-800 text-white shadow-xs'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Company Invoices</span>
          <span className="text-2xs opacity-80 font-normal hidden sm:inline">
            (Corporate B2B &amp; Multi-Currency)
          </span>
        </button>
      </div>

      {/* Render active section */}
      {activeTab === 'student' ? (
        <InvoiceList />
      ) : (
        <CompanyInvoiceList />
      )}
    </div>
  )
}
