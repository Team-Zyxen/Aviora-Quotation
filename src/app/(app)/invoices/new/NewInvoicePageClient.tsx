'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InvoiceForm } from './InvoiceForm'
import { CompanyInvoiceForm } from './CompanyInvoiceForm'
import { GraduationCap, Building2 } from 'lucide-react'

interface NewInvoicePageClientProps {
  initialType?: string | null
  prefillQuotationId?: string | null
}

export function NewInvoicePageClient({
  initialType,
  prefillQuotationId,
}: NewInvoicePageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentTypeParam = searchParams.get('type')

  const [activeTab, setActiveTab] = useState<'student' | 'company'>(
    (currentTypeParam || initialType) === 'company' ? 'company' : 'student'
  )

  const handleTabChange = (tab: 'student' | 'company') => {
    setActiveTab(tab)
    const newParams = new URLSearchParams(searchParams.toString())
    if (tab === 'company') {
      newParams.set('type', 'company')
    } else {
      newParams.delete('type')
    }
    router.replace(`/invoices/new?${newParams.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Top Invoice Type Selector Bar */}
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
          <span>Student Invoice</span>
          <span className="text-2xs opacity-80 font-normal hidden sm:inline">
            (Academic &amp; Term Fees)
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
          <span>Company Invoice</span>
          <span className="text-2xs opacity-80 font-normal hidden sm:inline">
            (Corporate B2B &amp; Multi-Currency)
          </span>
        </button>
      </div>

      {/* Render active form */}
      {activeTab === 'student' ? (
        <InvoiceForm prefillQuotationId={prefillQuotationId || null} />
      ) : (
        <CompanyInvoiceForm />
      )}
    </div>
  )
}
