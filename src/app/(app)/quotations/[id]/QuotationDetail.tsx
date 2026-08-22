'use client'

import React, { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { convertQuotationToInvoice } from '@/lib/rpc/financial'
import { invalidateAfterQuotationConverted } from '@/lib/rpc/invalidation'
import { generateIdempotencyKey } from '@/lib/utils/idempotency'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { StatusBadge, type StatusType } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { useToast } from '@/components/ui/Toast'
import {
  ArrowLeft,
  Download,
  Edit2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Send,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import type { Quotation, QuotationStatus, CompanySettings } from '@/types/database'

export function QuotationDetail() {
  const params = useParams()
  const router = useRouter()
  const quoteId = params.id as string
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  // Error Banner state for verbatim RPC errors
  const [conversionError, setConversionError] = useState<string | null>(null)

  // Idempotency Key Ref for quotation conversion
  const idempotencyKeyRef = useRef<string | null>(null)

  // Fetch quotation details via QueryKey registry
  const { data: quotation, isLoading, isError } = useQuery({
    queryKey: queryKeys.quotations.detail(quoteId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select(`
          *,
          students (
            id,
            admission_no,
            name,
            phone,
            email,
            address,
            guardian_name
          ),
          quotation_items (
            id,
            description,
            quantity,
            unit_price,
            discount_amount,
            line_total
          )
        `)
        .eq('id', quoteId)
        .single()

      if (error) throw error
      return data as unknown as Quotation
    },
  })

  // Convert to Invoice Mutation (Authoritative convert_quotation_to_invoice execution)
  const convertToInvoiceMutation = useMutation({
    mutationFn: async () => {
      setConversionError(null)

      if (!quotation) throw new Error('Quotation not loaded')
      if (quotation.status !== 'accepted') {
        throw new Error(`Only an accepted quotation can be converted. Current status: ${quotation.status}`)
      }
      if (!quotation.student_id) {
        throw new Error('Cannot convert a quotation with no linked student record')
      }

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey()
      }

      const dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0]

      const result = await convertQuotationToInvoice({
        quotationId: quotation.id,
        dueDate,
        idempotencyKey: idempotencyKeyRef.current,
      })

      return result
    },
    onError: (err: Error) => {
      setConversionError(err.message)
      toastError('Failed to convert quotation to invoice', err.message)
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null
      success(`Converted to Tax Invoice ${result.invoice_no}`)
      await invalidateAfterQuotationConverted(queryClient, {
        quotationId: quotation?.id,
        studentId: quotation?.student_id,
      })
      router.push(`/invoices/${result.invoice_id}`)
    },
  })

  // Fetch company branding for display
  const { data: companySettings } = useQuery({
    queryKey: queryKeys.companySettings,
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      return (data || null) as unknown as CompanySettings
    },
  })

  // Status Change Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: QuotationStatus) => {
      const { error } = await supabase
        .from('quotations')
        .update({ status: newStatus })
        .eq('id', quoteId)
      if (error) throw error
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.quotations.detail(quoteId) })
      const prev = queryClient.getQueryData<Quotation>(queryKeys.quotations.detail(quoteId))
      if (prev) {
        queryClient.setQueryData<Quotation>(queryKeys.quotations.detail(quoteId), {
          ...prev,
          status: newStatus,
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.quotations.detail(quoteId), context?.prev)
      toastError('Failed to update quotation status', err.message)
    },
    onSuccess: (_, newStatus) => {
      success(`Quotation marked as ${newStatus.toUpperCase()}`)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations.detail(quoteId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations.all })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (isError || !quotation) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Quotation not found</h3>
        <p className="text-sm text-gray-500">
          The requested quotation could not be found or has been removed.
        </p>
        <Link
          href="/quotations"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 rounded-lg hover:bg-navy-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Quotations List
        </Link>
      </div>
    )
  }

  const recipientName =
    quotation.students?.name || quotation.student_name_snapshot || quotation.lead_name || 'Valued Prospect'
  const recipientPhone = quotation.students?.phone || quotation.lead_phone
  const recipientEmail = quotation.students?.email || quotation.lead_email
  const items = quotation.quotation_items || []

  return (
    <div className="space-y-8">
      {/* Top Breadcrumbs & Actions Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/quotations"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Fee Quotation
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-xs font-mono font-bold text-navy-800">
                {quotation.quote_no}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              {recipientName}
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Transitions */}
          {quotation.status === 'draft' && (
            <button
              onClick={() => updateStatusMutation.mutate('sent')}
              disabled={updateStatusMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Mark as Sent
            </button>
          )}

          {quotation.status === 'sent' && (
            <>
              <button
                onClick={() => updateStatusMutation.mutate('accepted')}
                disabled={updateStatusMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark as Accepted
              </button>

              <button
                onClick={() => updateStatusMutation.mutate('expired')}
                disabled={updateStatusMutation.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
              >
                <XCircle className="w-3.5 h-3.5" />
                Mark as Expired
              </button>
            </>
          )}

          {/* Convert to Invoice Button */}
          <button
            onClick={() => convertToInvoiceMutation.mutate()}
            disabled={quotation.status !== 'accepted' || convertToInvoiceMutation.isPending}
            title={
              quotation.status === 'accepted'
                ? 'Convert this accepted quotation into an active Tax Invoice'
                : 'Only accepted quotations can be converted to invoices'
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors ${
              quotation.status === 'accepted'
                ? 'bg-accent text-navy-950 border-amber-300 hover:bg-amber-400 cursor-pointer shadow-xs'
                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
            }`}
          >
            {convertToInvoiceMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5" />
            )}
            Convert to Invoice
          </button>

          {/* Edit Quotation */}
          {quotation.status !== 'converted' && (
            <Link
              href={`/quotations/${quotation.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Link>
          )}

          <a
            href={`/api/quotations/${quotation.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-navy-900 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            PDF Quotation
          </a>
        </div>
      </div>

      {/* Error Banner for Conversion Exception */}
      {conversionError && (
        <ErrorBanner
          error={conversionError}
          title="Quotation Conversion Error"
          onDismiss={() => setConversionError(null)}
        />
      )}

      {/* Main Document Layout */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Document Header Banner */}
        <div className="p-6 bg-linear-to-r from-navy-900 via-navy-800 to-navy-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-extrabold tracking-tight font-mono">
                {quotation.quote_no}
              </h2>
              <StatusBadge status={quotation.status as StatusType} />
            </div>
            <p className="text-xs text-navy-200">
              Quote Date: {new Date(quotation.quote_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {quotation.valid_until && ` | Valid Until: ${new Date(quotation.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 p-4 rounded-xl backdrop-blur-xs border border-white/10">
            <div className="text-right">
              <span className="text-2xs uppercase tracking-wider text-navy-200 block font-semibold">
                Estimated Total Investment
              </span>
              <span className="text-2xl font-extrabold font-mono text-white">
                {formatCurrency(quotation.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Quotation Body Content */}
        <div className="p-8 space-y-8">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-gray-100">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Prepared For (Lead / Student)
              </h3>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {quotation.students?.id ? (
                    <Link
                      href={`/students/${quotation.students.id}`}
                      className="text-base font-bold text-navy-800 hover:text-navy-950 hover:underline"
                    >
                      {recipientName}
                    </Link>
                  ) : (
                    <span className="text-base font-bold text-gray-900 flex items-center gap-2">
                      {recipientName}
                      {quotation.student_id && !quotation.students && (
                        <span className="text-2xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-normal border border-gray-200">
                          (Deleted Student)
                        </span>
                      )}
                    </span>
                  )}
                </div>
                {quotation.students?.admission_no && (
                  <p className="text-xs text-gray-600 font-mono">Admission No: {quotation.students.admission_no}</p>
                )}
                {recipientPhone && <p className="text-xs text-gray-600">Phone: {recipientPhone}</p>}
                {recipientEmail && <p className="text-xs text-gray-600">Email: {recipientEmail}</p>}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Issued By (Academy Particulars)
              </h3>
              <div className="space-y-1">
                <p className="text-base font-bold text-gray-900">
                  {companySettings?.company_name || 'Aviora Aviation Academy'}
                </p>
                {companySettings?.company_phone && (
                  <p className="text-xs text-gray-600">Phone: {companySettings.company_phone}</p>
                )}
                {companySettings?.company_email && (
                  <p className="text-xs text-gray-600">Email: {companySettings.company_email}</p>
                )}
                {companySettings?.gstin && (
                  <p className="text-xs text-gray-500 font-mono">GSTIN: {companySettings.gstin}</p>
                )}
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Proposed Course Fee Structure</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Fee Head / Service Description</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Rate</th>
                    <th className="px-4 py-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                        No itemized fee items recorded in quotation.
                      </td>
                    </tr>
                  ) : (
                    items.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td className="px-4 py-3 text-gray-400">{idx + 1}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-600">{formatCurrency(item.unit_price)}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">{formatCurrency(item.line_total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Calculations Summary */}
          <div className="flex justify-end pt-4">
            <div className="w-full max-w-xs space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross Fee Subtotal</span>
                <span className="font-mono font-semibold text-gray-900">{formatCurrency(quotation.subtotal)}</span>
              </div>

              {Number(quotation.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Concession / Discount</span>
                  <span className="font-mono font-semibold">- {formatCurrency(quotation.discount_amount)}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-600 pt-2 border-t border-gray-100">
                <span>Applicable GST Tax ({quotation.gst_percent}%)</span>
                <span className="font-mono font-semibold text-gray-900">{formatCurrency(quotation.gst_amount)}</span>
              </div>

              <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Estimated Total</span>
                <span className="font-mono font-extrabold text-navy-900">{formatCurrency(quotation.total)}</span>
              </div>
            </div>
          </div>

          {/* Terms & Conditions */}
          {quotation.terms_text && (
            <div className="pt-6 border-t border-gray-200 space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Terms & Conditions</h4>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{quotation.terms_text}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
