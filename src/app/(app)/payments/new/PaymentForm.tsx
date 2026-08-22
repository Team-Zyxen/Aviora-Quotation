'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { recordPayment } from '@/lib/rpc/financial'
import { invalidateAfterPaymentRecorded } from '@/lib/rpc/invalidation'
import { generateIdempotencyKey } from '@/lib/utils/idempotency'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { SearchableStudentSelect } from '@/components/ui/SearchableStudentSelect'
import {
  CreditCard,
  ArrowLeft,
  User,
  FileSpreadsheet,
  AlertTriangle,
  Receipt,
  Sparkles,
  Loader2,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import {
  CompanyDetailsPanel,
  CompanyDetailsState,
  CompanyDetailsChangePayload,
  saveCompanySettings,
} from '@/components/shared/CompanyDetailsPanel'
import type { Student, Invoice, PaymentMode } from '@/types/database'

interface PaymentFormProps {
  prefillInvoiceId?: string | null
}

export function PaymentForm({ prefillInvoiceId }: PaymentFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  // Error Banner state for verbatim RPC errors (e.g. overpayment rejection)
  const [formError, setFormError] = useState<string | null>(null)

  // Idempotency Key Ref: generated once per submission attempt
  const idempotencyKeyRef = useRef<string | null>(null)

  const [studentId, setStudentId] = useState<string>('')
  const [invoiceId, setInvoiceId] = useState<string>(prefillInvoiceId || '')
  const [amount, setAmount] = useState<number | ''>('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('bank_transfer')
  const [referenceNo, setReferenceNo] = useState('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsChangePayload | null>(null)

  // 1. Fetch active students via QueryKey registry
  const { data: studentsList, isLoading: loadingStudents } = useQuery({
    queryKey: queryKeys.students.forPayment,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, admission_no, roll_number, phone')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as Student[]
    },
  })

  // 2. Fetch prefilled invoice details if prefillInvoiceId is provided
  const { data: prefilledInvoice } = useQuery({
    queryKey: queryKeys.invoices.prefilledForPayment(prefillInvoiceId || ''),
    enabled: !!prefillInvoiceId,
    queryFn: async () => {
      const { data: inv, error } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_no,
          student_id,
          grand_total
        `)
        .eq('id', prefillInvoiceId!)
        .single()

      if (error) throw error

      const { data: bal } = await supabase
        .from('invoice_balances')
        .select('amount_paid, balance_due, computed_status')
        .eq('invoice_id', prefillInvoiceId!)
        .maybeSingle()

      return {
        ...inv,
        invoice_balances: bal || {
          amount_paid: 0,
          balance_due: inv.grand_total,
          computed_status: 'sent',
        },
      } as unknown as Invoice
    },
  })

  // Synchronize studentId when prefilledInvoice is loaded
  useEffect(() => {
    if (prefilledInvoice?.student_id && !studentId) {
      setStudentId(prefilledInvoice.student_id)
    }
  }, [prefilledInvoice, studentId])

  // 3. Fetch open / unpaid invoices for the selected student
  const { data: studentInvoices, isLoading: loadingInvoices } = useQuery({
    queryKey: queryKeys.invoices.openForStudent(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data: rawInvoices, error: invErr } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_no,
          invoice_date,
          due_date,
          grand_total,
          status,
          enrollments (
            courses (
              name
            )
          ),
          course_terms (
            term_label
          )
        `)
        .eq('student_id', studentId)
        .neq('status', 'cancelled')
        .neq('status', 'draft')
        .order('created_at', { ascending: false })

      if (invErr) throw invErr
      if (!rawInvoices || rawInvoices.length === 0) return []

      const invIds = rawInvoices.map((i) => i.id)
      const { data: rawBalances, error: balErr } = await supabase
        .from('invoice_balances')
        .select('*')
        .in('invoice_id', invIds)

      if (balErr) throw balErr

      const balancesMap = new Map((rawBalances || []).map((b: any) => [b.invoice_id, b]))

      const invoices = rawInvoices
        .map((inv: any) => ({
          ...inv,
          invoice_balances: balancesMap.get(inv.id) || {
            invoice_id: inv.id,
            grand_total: inv.grand_total,
            amount_paid: 0,
            balance_due: inv.grand_total,
            computed_status: inv.status || 'sent',
          },
        }))
        .filter((inv: any) => Number(inv.invoice_balances.balance_due) > 0)

      return invoices as unknown as Invoice[]
    },
  })

  // Auto-select first open invoice if studentInvoices loads and invoiceId is not set
  useEffect(() => {
    if (studentInvoices && studentInvoices.length > 0 && !invoiceId) {
      setInvoiceId(studentInvoices[0].id)
    }
  }, [studentInvoices, invoiceId])

  // Selected invoice balances for live preview panel
  const selectedInvoice =
    studentInvoices?.find((i) => i.id === invoiceId) || (prefilledInvoice as any)
  const balances = selectedInvoice?.invoice_balances
  const invoiceGrandTotal = Number(selectedInvoice?.grand_total) || 0
  const invoiceAmountPaid = Number(balances?.amount_paid) || 0
  const invoiceBalanceDue = Number(balances?.balance_due ?? invoiceGrandTotal)

  // Live real-time preview calculations for instant UI feedback
  const enteredAmount = typeof amount === 'number' ? amount : 0
  const resultingBalance = Math.max(0, invoiceBalanceDue - enteredAmount)
  const isOverpaying = enteredAmount > invoiceBalanceDue && invoiceBalanceDue > 0

  // Record Payment Mutation (Authoritative record_payment RPC execution)
  const recordPaymentMutation = useMutation({
    mutationFn: async () => {
      setFormError(null)

      if (!studentId) throw new Error('Please select an enrolled student')
      if (!invoiceId) throw new Error('Please select an open tax invoice to credit payment towards')
      if (!enteredAmount || enteredAmount <= 0) {
        throw new Error('Payment amount must be greater than zero')
      }

      // Save updated company & document settings ONLY if edited by user
      if (companyDetails?.isDirty) {
        try {
          await saveCompanySettings(supabase, companyDetails.values)
        } catch (csErr: any) {
          console.warn('Company settings update warning:', {
            message: csErr.message || csErr,
            code: csErr.code,
            details: csErr.details,
            hint: csErr.hint,
          })
          toastError(
            'Settings Save Notice',
            'Payment will be recorded, but company default settings could not be updated.'
          )
        }
      }

      // Generate idempotency key on first submission attempt if not already set
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey()
      }

      // Call authoritative record_payment database RPC wrapper
      const result = await recordPayment({
        invoiceId,
        amount: enteredAmount,
        paymentDate,
        paymentMode,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
        idempotencyKey: idempotencyKeyRef.current,
      })

      return result
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toastError('Payment recording failed', err.message)
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null
      success(`Receipt ${result.receipt_no} issued successfully`)

      // Invalidate targeted queries using Phase A invalidation helper
      await invalidateAfterPaymentRecorded(queryClient, { invoiceId, studentId })

      // Redirect to invoice detail view showing fresh balance and receipt history
      router.push(`/invoices/${invoiceId}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    recordPaymentMutation.mutate()
  }

  if (loadingStudents) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/payments"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Student Billing / Collections
            </span>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              Record Student Payment & Issue Receipt
            </h1>
          </div>
        </div>
      </div>

      {/* Error Banner for Unmasked Database / RPC Exceptions */}
      {formError && (
        <ErrorBanner
          error={formError}
          title="Payment Processing Exception"
          onDismiss={() => setFormError(null)}
        />
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Student & Open Invoice Selector */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <User className="w-4 h-4 text-navy-700" />
              Student & Open Invoice Allocation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Student *
                </label>
                <SearchableStudentSelect
                  students={studentsList || []}
                  value={studentId}
                  onChange={(id) => {
                    setStudentId(id)
                    setInvoiceId('')
                  }}
                  placeholder="-- Choose student --"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Open Tax Invoice *
                </label>
                <select
                  required
                  disabled={!studentId || loadingInvoices}
                  value={invoiceId}
                  onChange={(e) => setInvoiceId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent disabled:bg-gray-100"
                >
                  <option value="">
                    {!studentId
                      ? '-- Select student first --'
                      : loadingInvoices
                      ? 'Loading open invoices...'
                      : studentInvoices?.length === 0
                      ? 'No open/unpaid invoices found for this student'
                      : '-- Select invoice --'}
                  </option>
                  {studentInvoices?.map((inv) => {
                    const courseName = inv.enrollments?.courses?.name || 'Program'
                    const termLabel = inv.course_terms?.term_label || 'Term'
                    const balDue = inv.invoice_balances?.balance_due ?? inv.grand_total

                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_no} — {courseName} ({termLabel}) — Due: {formatCurrency(balDue)}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Payment Particulars & Remittance Details */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <CreditCard className="w-4 h-4 text-navy-700" />
              Payment Particulars & Transaction Reference
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payment Amount (₹) *
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  placeholder="Enter payment amount"
                  value={amount === 0 ? '' : amount}
                  onChange={(e) =>
                    setAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono font-bold text-navy-900 shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bank Reference / UTR / Cheque No
                </label>
                <input
                  type="text"
                  placeholder="e.g. UTR123456789 or CHQ-009841"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent font-mono uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
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

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Remittance Notes / Remarks
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional internal notes or receipt remittance remarks..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 p-3 text-xs shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Company & Document Details (Editable Panel) */}
          <CompanyDetailsPanel onChange={setCompanyDetails} initialCollapsed={true} />
        </div>

        {/* Right Sidebar: Live Real-Time Ledger Preview */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 sticky top-24">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Receipt className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-gray-900">Live Balance Preview</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Billed Term Fee (Grand Total)</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatCurrency(invoiceGrandTotal)}
                </span>
              </div>

              <div className="flex justify-between text-emerald-800">
                <span>Already Paid So Far</span>
                <span className="font-mono font-semibold">
                  {formatCurrency(invoiceAmountPaid)}
                </span>
              </div>

              <div className="flex justify-between text-gray-700 pt-2 border-t border-gray-100 font-medium">
                <span>Balance Due Before Payment</span>
                <span className="font-mono font-bold text-rose-700">
                  {formatCurrency(invoiceBalanceDue)}
                </span>
              </div>

              <div className="flex justify-between text-emerald-700 pt-1 font-semibold">
                <span>This Payment Amount</span>
                <span className="font-mono font-bold text-emerald-800 text-sm">
                  - {formatCurrency(enteredAmount)}
                </span>
              </div>

              {/* Resulting Balance Card */}
              <div className="p-4 rounded-xl bg-navy-50/70 border border-navy-100 space-y-1 text-navy-950">
                <span className="text-2xs font-bold uppercase tracking-wider text-navy-700 block">
                  Resulting Balance After Payment
                </span>
                <div className="text-xl font-extrabold text-navy-900 font-mono">
                  {formatCurrency(resultingBalance)}
                </div>
                <span className="text-2xs text-gray-500 block">
                  {enteredAmount > 0 && invoiceBalanceDue > 0
                    ? resultingBalance <= 0
                      ? '✓ Invoice will be marked as FULLY PAID'
                      : 'Invoice will remain in PARTIAL payment status'
                    : selectedInvoice
                    ? 'Enter payment amount to preview updated status'
                    : 'Select student and open invoice to preview'}
                </span>
              </div>

              {isOverpaying && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-2xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Payment amount exceeds current invoice balance. Please verify payment amount.
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={recordPaymentMutation.isPending || !studentId || !invoiceId || !enteredAmount}
                className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {recordPaymentMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Generate Receipt & Save
              </button>

            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
