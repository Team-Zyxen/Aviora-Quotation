'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { CompanyInvoiceForm } from '@/app/(app)/invoices/new/CompanyInvoiceForm'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertCircle } from 'lucide-react'
import type { CompanyInvoice } from '@/types/database'

export function EditCompanyInvoiceClient() {
  const params = useParams()
  const invoiceId = params.id as string
  const supabase = createClient()

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: queryKeys.companyInvoices.detail(invoiceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_invoices')
        .select(`
          *,
          company_invoice_items (*)
        `)
        .eq('id', invoiceId)
        .single()

      if (error) throw error
      return data as unknown as CompanyInvoice
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isError || !invoice) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Company Invoice not found</h3>
        <p className="text-sm text-gray-500">
          The requested company invoice could not be found or has been removed.
        </p>
      </div>
    )
  }

  return <CompanyInvoiceForm initialInvoice={invoice} />
}
