'use client'

import React, { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { recordPayment } from '@/lib/rpc/financial'
import { invalidateAfterPaymentRecorded } from '@/lib/rpc/invalidation'
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
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  Send,
  Receipt,
  User,
  GraduationCap,
  Calendar,
  CreditCard,
  Layers,
  Loader2,
  X,
} from 'lucide-react'
import type { Invoice, InvoiceStatus, CompanySettings, PaymentMode } from '@/types/database'

export function InvoiceDetail() {
  const params = useParams()
  const invoiceId = params.id as string
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)

  // Inline Record Payment Modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<number | ''>('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('bank_transfer')
  const [referenceNo, setReferenceNo] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentNotes, setPaymentNotes] = useState('')
  const [paymentError, setPaymentError] = useState<string | null>(null)

  // Idempotency Key Ref for modal payment submission
  const idempotencyKeyRef = useRef<string | null>(null)

  // Fetch full invoice record with relations, line items, and invoice_balances view
  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: queryKeys.invoices.detail(invoiceId),
    queryFn: async () => {
      const { data: rawInvoice, error } = await supabase
        .from('invoices')
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
          enrollments (
            id,
            batch_year,
            current_term,
            courses (
              id,
              name,
              duration_terms
            )
          ),
          course_terms (
            id,
            term_no,
            term_label,
            term_fee
          ),
          invoice_items (
            id,
            description,
            quantity,
            unit_price,
            line_total
          ),
          payments (
            id,
            receipt_no,
            amount,
            payment_date,
            payment_mode,
            reference_no,
            notes,
            paid_at
          )
        `)
        .eq('id', invoiceId)
        .single()

      if (error) throw error
      if (!rawInvoice) return null

      const { data: balanceData } = await supabase
        .from('invoice_balances')
        .select('*')
        .eq('invoice_id', invoiceId)
        .maybeSingle()

      return {
        ...rawInvoice,
        invoice_balances: balanceData || {
          invoice_id: invoiceId,
          grand_total: rawInvoice.grand_total,
          amount_paid: 0,
          balance_due: rawInvoice.grand_total,
          computed_status: rawInvoice.status || 'draft',
        },
      } as unknown as Invoice
    },
  })

  // Fetch company branding
  const { data: companySettings } = useQuery({
    queryKey: queryKeys.companySettings,
    queryFn: async () => {
      const { data } = await supabase.from('company_settings').select('*').limit(1).maybeSingle()
      return (data || null) as unknown as CompanySettings
    },
  })

  // Record Payment Mutation (Authoritative payment execution)
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      setPaymentError(null)
      const numericAmount = typeof paymentAmount === 'number' ? paymentAmount : 0

      if (!numericAmount || numericAmount <= 0) {
        throw new Error('Payment amount must be greater than zero')
      }

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey()
      }

      const result = await recordPayment({
        invoiceId,
        amount: numericAmount,
        paymentDate,
        paymentMode,
        referenceNo: referenceNo.trim() || null,
        notes: paymentNotes.trim() || null,
        idempotencyKey: idempotencyKeyRef.current,
      })

      return result
    },
    onError: (err: Error) => {
      setPaymentError(err.message)
      toastError('Payment recording failed', err.message)
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null
      success(`Receipt ${result.receipt_no} issued successfully`)
      setIsPaymentModalOpen(false)
      setPaymentAmount('')
      setReferenceNo('')
      setPaymentNotes('')
      setPaymentError(null)

      // Invalidate targeted queries using Phase A invalidation helper
      await invalidateAfterPaymentRecorded(queryClient, {
        invoiceId,
        studentId: invoice?.student_id,
      })
    },
  })

  // Cancel Invoice Mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'cancelled' as InvoiceStatus })
        .eq('id', invoiceId)
      if (error) throw error
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.invoices.detail(invoiceId) })
      const prev = queryClient.getQueryData<Invoice>(queryKeys.invoices.detail(invoiceId))
      if (prev) {
        queryClient.setQueryData<Invoice>(queryKeys.invoices.detail(invoiceId), {
          ...prev,
          status: 'cancelled',
        })
      }
      return { prev }
    },
    onError: (err: Error, _vars, context) => {
      queryClient.setQueryData(queryKeys.invoices.detail(invoiceId), context?.prev)
      toastError('Failed to cancel invoice', err.message)
    },
    onSuccess: () => {
      success('Invoice marked as Cancelled')
      setIsCancelModalOpen(false)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(invoiceId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
    },
  })

  // Mark as Sent Mutation (if in draft)
  const markAsSentMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'sent' as InvoiceStatus })
        .eq('id', invoiceId)
      if (error) throw error
    },
    onSuccess: () => {
      success('Invoice marked as Issued/Sent')
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(invoiceId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all })
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

  if (isError || !invoice) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Tax Invoice not found</h3>
        <p className="text-sm text-gray-500">
          The requested invoice could not be found or has been removed.
        </p>
        <Link
          href="/invoices"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 rounded-lg hover:bg-navy-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Invoices List
        </Link>
      </div>
    )
  }

  const student = invoice.students
  const course = invoice.enrollments?.courses
  const term = invoice.course_terms
  const items = invoice.invoice_items || []
  const payments = invoice.payments || []
  const balances = invoice.invoice_balances
  const computedStatus = balances?.computed_status || invoice.status || 'draft'
  const amountPaid = balances?.amount_paid || 0
  const balanceDue = balances?.balance_due ?? invoice.grand_total

  return (
    <div className="space-y-8">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Tax Invoice
              </span>
              <span className="text-gray-300">/</span>
              <span className="text-xs font-mono font-bold text-navy-800">
                {invoice.invoice_no}
              </span>
              <span className="text-2xs font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                FY {invoice.fy_label}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              {student?.name || invoice.student_name_snapshot || 'Enrolled Student'}
            </h1>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {balanceDue > 0 && invoice.status !== 'cancelled' && (
            <button
              onClick={() => {
                setPaymentAmount(balanceDue)
                setPaymentError(null)
                setIsPaymentModalOpen(true)
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              Record Payment
            </button>
          )}

          {invoice.status === 'draft' && (
            <button
              onClick={() => markAsSentMutation.mutate()}
              disabled={markAsSentMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              Mark as Issued
            </button>
          )}

          {invoice.status !== 'cancelled' && (
            <Link
              href={`/invoices/${invoice.id}/edit`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </Link>
          )}

          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-navy-900 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF
          </a>

          {invoice.status !== 'cancelled' && (
            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              Cancel Invoice
            </button>
          )}
        </div>
      </div>

      {/* Main Document Layout */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Document Banner */}
        <div className="p-6 bg-linear-to-r from-navy-900 via-navy-800 to-navy-950 text-white flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-extrabold tracking-tight font-mono">
                {invoice.invoice_no}
              </h2>
              <StatusBadge status={computedStatus as StatusType} />
            </div>
            <p className="text-xs text-navy-200">
              Tax Invoice Issued: {new Date(invoice.invoice_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | Payment Due: {new Date(invoice.due_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white/10 p-4 rounded-xl backdrop-blur-xs border border-white/10">
            <div className="text-right">
              <span className="text-2xs uppercase tracking-wider text-navy-200 block font-semibold">
                Balance Outstanding
              </span>
              <span className="text-2xl font-extrabold font-mono text-white">
                {formatCurrency(balanceDue)}
              </span>
            </div>
          </div>
        </div>

        {/* Invoice Body Content */}
        <div className="p-8 space-y-8">
          {/* Metadata Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-gray-100">
            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Billed To (Student Information)
              </h3>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {student?.id ? (
                    <Link
                      href={`/students/${student.id}`}
                      className="text-base font-bold text-navy-800 hover:text-navy-950 hover:underline"
                    >
                      {student?.name || invoice.student_name_snapshot || 'Enrolled Student'}
                    </Link>
                  ) : (
                    <span className="text-base font-bold text-gray-900 flex items-center gap-2">
                      {invoice.student_name_snapshot || 'Enrolled Student'}
                      <span className="text-2xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 font-normal border border-gray-200">
                        (Deleted Student)
                      </span>
                    </span>
                  )}
                </div>
                {student?.admission_no && (
                  <p className="text-xs text-gray-600 font-mono">Admission No: {student.admission_no}</p>
                )}
                {student?.phone && <p className="text-xs text-gray-600">Phone: {student.phone}</p>}
                {student?.email && <p className="text-xs text-gray-600">Email: {student.email}</p>}
                {student?.address && <p className="text-xs text-gray-500 mt-1">{student.address}</p>}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Academic Program & Term
              </h3>
              <div className="space-y-1">
                <p className="text-base font-bold text-gray-900">{course?.name || 'Standard Curriculum'}</p>
                <p className="text-xs text-gray-600">
                  {term?.term_label ? `Billing Term: ${term.term_label}` : 'General Tuition Fee'}
                </p>
                <p className="text-xs text-gray-500">
                  Batch: {invoice.enrollments?.batch_year ? `Batch ${invoice.enrollments.batch_year}` : 'Current Academic Session'}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-gray-900">Fee Head Breakdown</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold uppercase tracking-wider text-2xs">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Fee Component / Description</th>
                    <th className="px-4 py-3 text-center">Qty</th>
                    <th className="px-4 py-3 text-right">Unit Price</th>
                    <th className="px-4 py-3 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                        No itemized line items recorded.
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

          {/* Financial Calculation Summary Table */}
          <div className="flex justify-end pt-4">
            <div className="w-full max-w-xs space-y-2 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span className="font-mono font-semibold text-gray-900">{formatCurrency(invoice.subtotal)}</span>
              </div>

              {Number(invoice.previous_outstanding) > 0 && (
                <div className="flex justify-between text-amber-800">
                  <span>Previous Outstanding</span>
                  <span className="font-mono font-semibold">+ {formatCurrency(invoice.previous_outstanding)}</span>
                </div>
              )}

              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono font-semibold">- {formatCurrency(invoice.discount_amount)}</span>
                </div>
              )}

              {Number(invoice.scholarship_amount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Scholarship</span>
                  <span className="font-mono font-semibold">- {formatCurrency(invoice.scholarship_amount)}</span>
                </div>
              )}

              {Number(invoice.coupon_amount) > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Coupon Deduction</span>
                  <span className="font-mono font-semibold">- {formatCurrency(invoice.coupon_amount)}</span>
                </div>
              )}

              <div className="flex justify-between text-gray-600 pt-2 border-t border-gray-100">
                <span>GST Tax ({invoice.gst_percent}%)</span>
                <span className="font-mono font-semibold text-gray-900">{formatCurrency(invoice.gst_amount)}</span>
              </div>

              <div className="flex justify-between text-sm font-bold text-gray-900 pt-2 border-t border-gray-200">
                <span>Grand Total</span>
                <span className="font-mono font-extrabold text-navy-900">{formatCurrency(invoice.grand_total)}</span>
              </div>

              <div className="flex justify-between text-xs font-semibold text-emerald-800 pt-1">
                <span>Total Paid</span>
                <span className="font-mono">{formatCurrency(amountPaid)}</span>
              </div>

              <div className="flex justify-between text-xs font-bold text-rose-700 pt-1 border-t border-gray-100">
                <span>Balance Due</span>
                <span className="font-mono text-sm">{formatCurrency(balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Payment Receipts History Section */}
          <div className="space-y-4 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 flex items-center justify-between">
              <span>Receipts & Payment History</span>
              <span className="text-2xs font-normal text-gray-500">
                {payments.length} payment receipt(s) recorded
              </span>
            </h3>

            {payments.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-2">
                No payments have been recorded against this invoice yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-700 font-semibold uppercase tracking-wider text-2xs">
                    <tr>
                      <th className="px-4 py-3">Receipt No</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Mode</th>
                      <th className="px-4 py-3">Reference No</th>
                      <th className="px-4 py-3 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-mono font-semibold text-navy-800 flex items-center gap-2">
                          {p.receipt_no}
                          <a
                            href={`/api/payments/${p.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-gray-400 hover:text-navy-700 rounded transition-colors"
                            title="Download Receipt PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(p.payment_date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-700">
                          {p.payment_mode || 'Bank Transfer'}
                        </td>
                        <td className="px-4 py-3 font-mono text-gray-500">
                          {p.reference_no || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Banking & Remittance Footer */}
          <div className="pt-6 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-gray-500">
            <div>
              <strong className="text-gray-900 block">
                {companySettings?.company_name || 'Aviora Aviation Academy Pvt Ltd'}
              </strong>
              <span>
                Bank: {companySettings?.bank_name || 'HDFC Bank Ltd'} | A/C:{' '}
                {companySettings?.bank_account_number || '50200084920192'} | IFSC:{' '}
                {companySettings?.bank_ifsc || 'HDFC0001234'}
              </span>
            </div>

            <div className="text-right font-mono text-2xs text-gray-400">
              Ref: {invoice.invoice_no} ({invoice.fy_label})
            </div>
          </div>
        </div>
      </div>

      {/* Inline Record Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Record Payment for {invoice.invoice_no}</h3>
                <p className="text-2xs text-gray-500">Student: {student?.name}</p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {paymentError && (
              <ErrorBanner
                error={paymentError}
                title="Payment Error"
                onDismiss={() => setPaymentError(null)}
              />
            )}

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <span className="text-2xs text-gray-500 block">Invoice Total</span>
                  <span className="font-mono font-bold text-gray-900">{formatCurrency(invoice.grand_total)}</span>
                </div>
                <div>
                  <span className="text-2xs text-gray-500 block">Current Balance Due</span>
                  <span className="font-mono font-bold text-rose-700">{formatCurrency(balanceDue)}</span>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-gray-700 mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  min={1}
                  step={100}
                  required
                  placeholder="Enter payment amount"
                  value={paymentAmount === 0 ? '' : paymentAmount}
                  onChange={(e) =>
                    setPaymentAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono font-bold text-navy-900 shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-gray-700 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                >
                  <option value="bank_transfer">Bank Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="upi">UPI (GPay / PhonePe / QR Transfer)</option>
                  <option value="cheque">Bank Demand Draft / Cheque</option>
                  <option value="cash">Cash Payment</option>
                </select>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-gray-700 mb-1">
                  Reference No / UTR / Cheque No
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR987654321"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono uppercase shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-gray-700 mb-1">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-gray-700 mb-1">
                  Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => recordPaymentMutation.mutate()}
                disabled={recordPaymentMutation.isPending || !paymentAmount}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs disabled:opacity-50"
              >
                {recordPaymentMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Payment & Issue Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Cancel Tax Invoice</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to cancel invoice{' '}
              <span className="font-mono font-bold text-navy-900">{invoice.invoice_no}</span>? This
              will set the status to Cancelled and eliminate the balance due from the student ledger.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
              >
                Keep Active
              </button>
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {cancelMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
