'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createInvoice } from '@/lib/rpc/financial'
import { invalidateAfterInvoiceCreated } from '@/lib/rpc/invalidation'
import { generateIdempotencyKey } from '@/lib/utils/idempotency'
import { queryKeys } from '@/lib/query-keys'
import { calculateInvoiceTotals } from '@/lib/invoices/calculations'
import { getFinancialYearLabel } from '@/lib/numbering/financial-year'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { SearchableStudentSelect } from '@/components/ui/SearchableStudentSelect'
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  ArrowLeft,
  User,
  GraduationCap,
  Calendar,
  Sparkles,
  Loader2,
  Receipt,
  Info,
  Layers,
} from 'lucide-react'
import {
  CompanyDetailsPanel,
  CompanyDetailsState,
  CompanyDetailsChangePayload,
  saveCompanySettings,
} from '@/components/shared/CompanyDetailsPanel'
import type {
  Student,
  Enrollment,
  Course,
  CourseTerm,
  FeeHead,
  Invoice,
  InvoiceStatus,
} from '@/types/database'

function getInitialInvoiceDates() {
  const d = new Date()
  const today = d.toISOString().split('T')[0]
  const due = new Date(d.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return { today, due }
}

const DEFAULT_INVOICE_DATES = getInitialInvoiceDates()

interface InvoiceFormProps {
  initialInvoice?: Invoice | null
  prefillQuotationId?: string | null
}

interface FormInvoiceLineItem {
  id?: string
  description: string
  quantity: number
  unit_price: number
}

export function InvoiceForm({ initialInvoice, prefillQuotationId }: InvoiceFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const isEditing = !!initialInvoice

  // Error Banner state for verbatim RPC errors
  const [formError, setFormError] = useState<string | null>(null)

  // Idempotency Key Ref: generated once on initial submit attempt and preserved for retries
  const idempotencyKeyRef = useRef<string | null>(null)

  // Form State
  const [studentId, setStudentId] = useState<string>(initialInvoice?.student_id || '')
  const [enrollmentId, setEnrollmentId] = useState<string>(initialInvoice?.enrollment_id || '')
  const [courseTermId, setCourseTermId] = useState<string>(initialInvoice?.course_term_id || '')
  const [quotationId] = useState<string | null>(
    initialInvoice?.quotation_id || prefillQuotationId || null
  )

  const [invoiceDate, setInvoiceDate] = useState(
    initialInvoice?.invoice_date || DEFAULT_INVOICE_DATES.today
  )
  const [dueDate, setDueDate] = useState(
    initialInvoice?.due_date || DEFAULT_INVOICE_DATES.due
  )
  const [manualInvoiceNo, setManualInvoiceNo] = useState<string>('')

  // Line items state
  const [items, setItems] = useState<FormInvoiceLineItem[]>(
    initialInvoice?.invoice_items?.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
    })) || [
      {
        description: '',
        quantity: 1,
        unit_price: 0,
      },
    ]
  )

  // Financial adjustment fields
  const [discountAmount, setDiscountAmount] = useState<number>(
    Number(initialInvoice?.discount_amount) || 0
  )
  const [scholarshipAmount, setScholarshipAmount] = useState<number>(
    Number(initialInvoice?.scholarship_amount) || 0
  )
  const [couponAmount, setCouponAmount] = useState<number>(
    Number(initialInvoice?.coupon_amount) || 0
  )
  const [gstPercent, setGstPercent] = useState<number>(
    initialInvoice ? Number(initialInvoice.gst_percent) : 18
  )
  const [notes, setNotes] = useState(
    initialInvoice?.notes ||
      '1. Payment must reference the tax invoice number.\n2. Invoices overdue beyond 15 days may incur late fee adjustments.'
  )
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsChangePayload | null>(null)

  // 1. Fetch active students via QueryKey registry
  const { data: studentsList, isLoading: loadingStudents } = useQuery({
    queryKey: queryKeys.students.forInvoice,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, admission_no, roll_number, phone, email')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as Student[]
    },
  })

  // 2. Fetch student's enrollments with course terms and fee heads when student is selected
  const { data: studentEnrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: queryKeys.students.enrollments(studentId),
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          student_id,
          course_id,
          batch_year,
          current_term,
          courses (
            id,
            name,
            duration_terms,
            course_terms (
              id,
              term_no,
              term_label,
              term_fee,
              fee_heads (
                id,
                label,
                amount
              )
            )
          )
        `)
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as unknown as Array<
        Enrollment & {
          courses: Course & {
            course_terms: Array<CourseTerm & { fee_heads: FeeHead[] }>
          }
        }
      >
    },
  })

  // 3. Query previous outstanding balance for instant preview in the summary panel
  // (Note: create_invoice RPC computes authoritative previous_outstanding in DB)
  const { data: previousOutstanding = 0 } = useQuery({
    queryKey: queryKeys.invoices.studentOutstanding(studentId, initialInvoice?.id),
    enabled: !!studentId,
    queryFn: async () => {
      const { data: priorInvoices, error: invErr } = await supabase
        .from('invoices')
        .select('id')
        .eq('student_id', studentId)
        .neq('status', 'cancelled')
        .neq('status', 'draft')

      if (invErr) throw invErr
      if (!priorInvoices || priorInvoices.length === 0) return 0

      let priorIds = priorInvoices.map((i) => i.id)
      if (initialInvoice?.id) {
        priorIds = priorIds.filter((id) => id !== initialInvoice.id)
      }

      if (priorIds.length === 0) return 0

      const { data: priorBalances, error: balErr } = await supabase
        .from('invoice_balances')
        .select('balance_due')
        .in('invoice_id', priorIds)

      if (balErr) throw balErr

      const totalOutstanding = (priorBalances || []).reduce((sum, b) => {
        return sum + Math.max(0, Number(b.balance_due) || 0)
      }, 0)

      return totalOutstanding
    },
  })

  // 4. Query terms that already have a non-cancelled invoice for the selected enrollment
  const { data: invoicedTermIds = [] } = useQuery({
    queryKey: ['invoices', 'invoicedTermIds', enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('course_term_id')
        .eq('enrollment_id', enrollmentId)
        .neq('status', 'cancelled')
        .not('course_term_id', 'is', null)

      if (error) throw error
      const ids = (data || [])
        .map((i: any) => i.course_term_id)
        .filter((id: string | null): id is string => !!id && (!isEditing || id !== initialInvoice?.course_term_id))
      return ids
    },
  })

  // Selected enrollment and available course terms
  const selectedEnrollment = studentEnrollments?.find((e) => e.id === enrollmentId)
  const availableTerms = selectedEnrollment?.courses?.course_terms || []

  // When a course term is selected, pre-fill line items from fee heads or term fee
  const handleTermSelection = (termId: string, currentEnrollmentList?: typeof studentEnrollments) => {
    setCourseTermId(termId)
    const enrList = currentEnrollmentList || studentEnrollments
    const currentEnr = enrList?.find((e) => e.id === (enrollmentId || enrList[0]?.id))
    const terms = currentEnr?.courses?.course_terms || availableTerms
    const selectedTerm = terms.find((t) => t.id === termId)
    if (!selectedTerm) return

    const courseName = currentEnr?.courses?.name || 'Academic Program'

    if (selectedTerm.fee_heads && selectedTerm.fee_heads.length > 0) {
      // Use itemized fee heads breakdown
      const newItems = selectedTerm.fee_heads.map((fh: any) => ({
        description: `${courseName} - ${selectedTerm.term_label}: ${fh.label || fh.name || 'Tuition Component'}`,
        quantity: 1,
        unit_price: Number(fh.amount) || 0,
      }))
      setItems(newItems)
    } else {
      // Fallback to single term fee
      setItems([
        {
          description: `${courseName} - ${selectedTerm.term_label} Tuition Fee`,
          quantity: 1,
          unit_price: Number(selectedTerm.term_fee) || 0,
        },
      ])
    }
  }

  // Auto-populate enrollment and term structure upon student selection, landing on next uninvoiced term
  useEffect(() => {
    if (studentEnrollments && studentEnrollments.length > 0 && !isEditing) {
      const targetEnr = enrollmentId
        ? studentEnrollments.find((e) => e.id === enrollmentId) || studentEnrollments[0]
        : studentEnrollments[0]

      if (!enrollmentId) {
        setEnrollmentId(targetEnr.id)
      }

      const terms = targetEnr.courses?.course_terms || []
      if (terms.length > 0 && (!courseTermId || invoicedTermIds.includes(courseTermId))) {
        const uninvoicedTerm =
          terms.find((t) => !invoicedTermIds.includes(t.id) && t.term_no === targetEnr.current_term) ||
          terms.find((t) => !invoicedTermIds.includes(t.id)) ||
          terms[0]

        if (uninvoicedTerm) {
          handleTermSelection(uninvoicedTerm.id, studentEnrollments)
        }
      }
    }
  }, [studentEnrollments, enrollmentId, invoicedTermIds])

  // Live real-time preview calculations for instant UI feedback
  const totals = calculateInvoiceTotals(
    items,
    previousOutstanding,
    discountAmount,
    scholarshipAmount,
    couponAmount,
    gstPercent
  )

  // Dynamic Line Item Handlers
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: 1,
        unit_price: 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, updates: Partial<FormInvoiceLineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }

  // Save Mutation (Authoritative create_invoice RPC Execution)
  const saveInvoiceMutation = useMutation({
    mutationFn: async (status: InvoiceStatus) => {
      setFormError(null)

      if (!studentId) {
        throw new Error('Please select an enrolled student')
      }
      if (!dueDate) {
        throw new Error('Please select an invoice payment due date')
      }
      if (items.length === 0 || items.some((it) => !it.description.trim())) {
        throw new Error('All fee line items must have a valid description')
      }
      if (items.some((it) => (Number(it.quantity) || 0) <= 0)) {
        throw new Error('Line item quantity must be greater than zero')
      }
      if (items.some((it) => (Number(it.unit_price) || 0) < 0)) {
        throw new Error('Line item unit price cannot be negative')
      }

      // Generate idempotency key on first submission attempt if not already set
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey()
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
            'Invoice will be generated, but company default settings could not be updated.'
          )
        }
      }

      // Format manual invoice number if provided
      let formattedManualInvoiceNo: string | null = null
      if (manualInvoiceNo.trim()) {
        const digitsOnly = manualInvoiceNo.trim().replace(/\D/g, '')
        if (!digitsOnly || parseInt(digitsOnly, 10) <= 0) {
          throw new Error('Manual invoice number must be a positive whole number')
        }
        const num = parseInt(digitsOnly, 10)
        const fy = getFinancialYearLabel(invoiceDate)
        formattedManualInvoiceNo = `AV/INV/${fy}/${String(num).padStart(5, '0')}`
      }

      // Call authoritative create_invoice database RPC wrapper
      const result = await createInvoice({
        studentId,
        enrollmentId: enrollmentId || null,
        courseTermId: courseTermId || null,
        quotationId: quotationId || null,
        invoiceDate,
        dueDate,
        items: items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        })),
        discountAmount: Number(discountAmount) || 0,
        scholarshipAmount: Number(scholarshipAmount) || 0,
        couponAmount: Number(couponAmount) || 0,
        gstPercent: Number(gstPercent) ?? 18,
        notes: notes.trim() || null,
        saveAsDraft: status === 'draft',
        idempotencyKey: idempotencyKeyRef.current,
        manualInvoiceNo: formattedManualInvoiceNo,
      })

      return result
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toastError('Invoice creation failed', err.message)
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null
      success(
        result.status === 'draft'
          ? `Draft invoice ${result.invoice_no} created successfully`
          : `Invoice ${result.invoice_no} issued successfully`
      )

      // Invalidate targeted queries using Phase A invalidation helper
      await invalidateAfterInvoiceCreated(queryClient, { studentId })

      // Redirect directly to the newly created invoice's detail view
      router.push(`/invoices/${result.invoice_id}`)
    },
  })

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
            href="/invoices"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Fee Management / Invoices
              </span>
              {quotationId && (
                <span className="text-2xs bg-amber-50 text-amber-800 font-semibold px-2 py-0.5 rounded border border-amber-200">
                  Converted from Quotation
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              {isEditing
                ? `Edit Tax Invoice (${initialInvoice.invoice_no})`
                : 'Create Tax Invoice'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveInvoiceMutation.mutate('draft')}
            disabled={saveInvoiceMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saveInvoiceMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save as Draft
          </button>

          <button
            type="button"
            onClick={() => saveInvoiceMutation.mutate('sent')}
            disabled={saveInvoiceMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saveInvoiceMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save & Issue Invoice
          </button>
        </div>
      </div>

      {/* Error Banner for Unmasked Database Exceptions */}
      {formError && (
        <ErrorBanner
          error={formError}
          title="Unable to Create Invoice"
          onDismiss={() => setFormError(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Student & Enrollment Term Selection */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <User className="w-4 h-4 text-navy-700" />
              Student & Academic Term Allocation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Enrolled Student *
                </label>
                <SearchableStudentSelect
                  students={studentsList || []}
                  value={studentId}
                  onChange={(id) => {
                    setStudentId(id)
                    setEnrollmentId('')
                    setCourseTermId('')
                  }}
                  placeholder="-- Choose a student --"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Course Enrollment Track
                </label>
                <select
                  disabled={!studentId || loadingEnrollments || !studentEnrollments || studentEnrollments.length === 0}
                  value={enrollmentId}
                  onChange={(e) => {
                    const newEnrId = e.target.value
                    setEnrollmentId(newEnrId)
                    setCourseTermId('')
                    const foundEnr = studentEnrollments?.find((en) => en.id === newEnrId)
                    const terms = foundEnr?.courses?.course_terms || []
                    if (terms.length > 0) {
                      const matchedTerm = terms.find((t) => t.term_no === foundEnr?.current_term) || terms[0]
                      handleTermSelection(matchedTerm.id)
                    }
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent disabled:bg-gray-100"
                >
                  <option value="">
                    {loadingEnrollments
                      ? 'Loading academic programs...'
                      : !studentId
                      ? '-- Select a student first --'
                      : studentEnrollments && studentEnrollments.length > 0
                      ? '-- Choose academic program --'
                      : 'No enrollments found for student'}
                  </option>
                  {studentEnrollments?.map((enr) => (
                    <option key={enr.id} value={enr.id}>
                      {enr.courses?.name} (Batch {enr.batch_year} - Term {enr.current_term})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Billing Term Structure *
                </label>
                <select
                  disabled={!enrollmentId || availableTerms.length === 0}
                  value={courseTermId}
                  onChange={(e) => handleTermSelection(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent disabled:bg-gray-100"
                >
                  <option value="">
                    {!enrollmentId ? '-- Select program first --' : '-- Select term to bill --'}
                  </option>
                  {availableTerms.map((t) => {
                    const isAlreadyInvoiced = invoicedTermIds.includes(t.id)
                    return (
                      <option key={t.id} value={t.id} disabled={isAlreadyInvoiced}>
                        {t.term_label} ({formatCurrency(t.term_fee)}){isAlreadyInvoiced ? ' — Already Invoiced' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Previous Outstanding (Authoritative Ledger)
                </label>
                <div className="w-full rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm font-mono font-bold text-amber-900 flex items-center justify-between">
                  <span>{formatCurrency(previousOutstanding)}</span>
                  <span className="text-2xs font-normal text-amber-700">Calculated in DB</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payment Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Invoice Number (Optional)
                  </label>
                  <div className="flex items-center rounded-lg border border-gray-300 bg-gray-50 focus-within:ring-1 focus-within:ring-accent focus-within:border-accent overflow-hidden shadow-2xs">
                    <span className="px-3 py-2 text-xs font-mono font-bold text-gray-600 bg-gray-100 border-r border-gray-200 select-none shrink-0">
                      AV/INV/{getFinancialYearLabel(invoiceDate)}/
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 321"
                      value={manualInvoiceNo}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '')
                        setManualInvoiceNo(val)
                      }}
                      className="w-full bg-white px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none"
                    />
                  </div>
                  <p className="text-2xs text-gray-400 mt-1">
                    Leave blank to auto-generate. Enter number only (e.g. 321 → AV/INV/{getFinancialYearLabel(invoiceDate)}/00321).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Itemized Fee Heads & Services */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-navy-700" />
                  Itemized Fee Heads & Tuition Charges
                </h3>
                <span className="text-2xs text-gray-400">
                  Pre-filled from course fee structure and fully customizable per student
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-navy-800 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Fee Head
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                return (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3"
                  >
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 sm:col-span-6">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Description / Fee Component *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Flight Simulator & Ground Training Fee"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateItem(index, { description: e.target.value })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          required
                          value={item.quantity}
                          onChange={(e) =>
                            handleUpdateItem(index, {
                              quantity: Math.max(1, parseInt(e.target.value) || 1),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-3">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Amount (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          required
                          placeholder="Enter amount"
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          onChange={(e) =>
                            handleUpdateItem(index, {
                              unit_price: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-1 flex items-center justify-end pb-1">
                        <button
                          type="button"
                          disabled={items.length <= 1}
                          onClick={() => handleRemoveItem(index)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer disabled:opacity-30"
                          title="Remove item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Card 3: Notes and Payment Terms */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-navy-700" />
              Invoice Notes & Remittance Guidelines
            </h3>
            <textarea
              rows={4}
              placeholder="Enter invoice notes and payment instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 text-xs shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          {/* Card 4: Company & Document Details (Editable Panel) */}
          <CompanyDetailsPanel onChange={setCompanyDetails} initialCollapsed={true} />
        </div>

        {/* Right Sidebar: Live Calculated Summary Panel */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 sticky top-24">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sparkles className="w-4 h-4 text-navy-800" />
              <h3 className="text-sm font-bold text-gray-900">Tax Invoice Summary</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross Term Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.subtotal)}
                </span>
              </div>

              {previousOutstanding > 0 && (
                <div className="flex justify-between text-amber-800 font-medium">
                  <span>Previous Outstanding</span>
                  <span>+ {formatCurrency(previousOutstanding)}</span>
                </div>
              )}

              {/* Deductions Inputs */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-2xs font-medium text-gray-600 mb-1">
                    Early Bird / General Discount (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter discount amount"
                    value={discountAmount === 0 ? '' : discountAmount}
                    onChange={(e) =>
                      setDiscountAmount(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-medium text-gray-600 mb-1">
                    Merit Scholarship (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter scholarship amount"
                    value={scholarshipAmount === 0 ? '' : scholarshipAmount}
                    onChange={(e) =>
                      setScholarshipAmount(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-2xs font-medium text-gray-600 mb-1">
                    Promotional Coupon (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter coupon amount"
                    value={couponAmount === 0 ? '' : couponAmount}
                    onChange={(e) =>
                      setCouponAmount(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>
              </div>

              {/* GST Percent Input */}
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <label className="block text-2xs font-medium text-gray-600">
                  Applicable GST Rate (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  placeholder="Enter GST rate %"
                  value={gstPercent === 0 ? '' : gstPercent}
                  onChange={(e) =>
                    setGstPercent(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div className="flex justify-between text-gray-600 pt-1">
                <span>GST Tax Value ({totals.gstPercent}%)</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.gstAmount)}
                </span>
              </div>

              {/* Net Grand Total */}
              <div className="p-4 rounded-xl bg-navy-50/70 border border-navy-100 flex items-center justify-between text-navy-950">
                <span className="text-xs font-bold uppercase tracking-wider">Grand Total</span>
                <span className="text-xl font-extrabold text-navy-900">
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => saveInvoiceMutation.mutate('sent')}
                disabled={saveInvoiceMutation.isPending}
                className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saveInvoiceMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {isEditing ? 'Update & Save' : 'Generate & Issue Invoice'}
              </button>

              <button
                type="button"
                onClick={() => saveInvoiceMutation.mutate('draft')}
                disabled={saveInvoiceMutation.isPending}
                className="w-full py-2 px-4 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Save as Working Draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
