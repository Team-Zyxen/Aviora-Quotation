'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { generateQuotationNumber } from '@/lib/numbering/generate-number'
import { calculateQuotationTotals } from '@/lib/quotations/calculations'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { SearchableStudentSelect } from '@/components/ui/SearchableStudentSelect'
import {
  FileText,
  Plus,
  Trash2,
  ArrowLeft,
  User,
  Sparkles,
  Loader2,
  Receipt,
  GraduationCap,
} from 'lucide-react'
import {
  CompanyDetailsPanel,
  CompanyDetailsState,
  CompanyDetailsChangePayload,
  saveCompanySettings,
} from '@/components/shared/CompanyDetailsPanel'
import type { Student, Course, CourseTerm, Quotation } from '@/types/database'

function getInitialDates() {
  const d = new Date()
  const today = d.toISOString().split('T')[0]
  const valid = new Date(d.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return { today, valid }
}

const DEFAULT_DATES = getInitialDates()

interface QuotationFormProps {
  initialQuotation?: Quotation | null
}

interface FormLineItem {
  id?: string
  description: string
  quantity: number
  unit_price: number
  discount_amount: number
}

export function QuotationForm({ initialQuotation }: QuotationFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const isEditing = !!initialQuotation

  // Form State
  const [recipientMode, setRecipientMode] = useState<'student' | 'lead'>(
    initialQuotation?.student_id ? 'student' : 'lead'
  )
  const [studentId, setStudentId] = useState<string>(initialQuotation?.student_id || '')
  const [leadName, setLeadName] = useState(initialQuotation?.lead_name || '')
  const [leadPhone, setLeadPhone] = useState(initialQuotation?.lead_phone || '')
  const [leadEmail, setLeadEmail] = useState(initialQuotation?.lead_email || '')

  const [quoteDate, setQuoteDate] = useState(initialQuotation?.quote_date || DEFAULT_DATES.today)
  const [validUntil, setValidUntil] = useState(initialQuotation?.valid_until || DEFAULT_DATES.valid)
  const [manualQuoteNo, setManualQuoteNo] = useState<string>('')
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsChangePayload | null>(null)

  // Line items state
  const [items, setItems] = useState<FormLineItem[]>(
    initialQuotation?.quotation_items?.map((it) => ({
      id: it.id,
      description: it.description,
      quantity: Number(it.quantity) || 1,
      unit_price: Number(it.unit_price) || 0,
      discount_amount: Number(it.discount_amount) || 0,
    })) || [
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
      },
    ]
  )

  const [overallDiscount, setOverallDiscount] = useState<number>(
    Number(initialQuotation?.discount_amount) || 0
  )
  const [gstPercent, setGstPercent] = useState<number>(
    initialQuotation ? Number(initialQuotation.gst_percent) : 18
  )
  const [termsText, setTermsText] = useState(
    initialQuotation?.terms_text ||
      '1. Fees quoted are subject to seat availability at enrollment.\n2. Applicable taxes (GST) are levied per Government of India guidelines.\n3. Installment schedules will be governed by admission agreements.'
  )

  // Fetch active students for selector
  const { data: studentsList, isLoading: loadingStudents } = useQuery({
    queryKey: queryKeys.students.forQuote,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, admission_no, roll_number, phone, email')
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as Student[]
    },
  })

  // Fetch courses and course terms for pre-fill helper
  const { data: coursesWithTerms } = useQuery({
    queryKey: queryKeys.courses.withTermsForQuote,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select(`
          id,
          name,
          course_terms (
            id,
            term_no,
            term_label,
            term_fee
          )
        `)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as unknown as Array<Course & { course_terms: CourseTerm[] }>
    },
  })

  // Live real-time calculations
  const totals = calculateQuotationTotals(items, overallDiscount, gstPercent)

  // Handlers for dynamic line items
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        description: '',
        quantity: 1,
        unit_price: 0,
        discount_amount: 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleUpdateItem = (index: number, updates: Partial<FormLineItem>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    )
  }

  // Pre-fill item from course fee structure
  const handlePrefillCourseTerm = (
    index: number,
    courseId: string,
    termId: string
  ) => {
    const course = coursesWithTerms?.find((c) => c.id === courseId)
    if (!course) return
    const term = course.course_terms?.find((t) => t.id === termId)
    if (!term) return

    handleUpdateItem(index, {
      description: `${course.name} - ${term.term_label}`,
      unit_price: Number(term.term_fee) || 0,
      quantity: 1,
      discount_amount: 0,
    })
  }

  // Save Mutation (Calculates authoritatively and stores in DB)
  const saveQuotationMutation = useMutation({
    mutationFn: async (status: 'draft' | 'sent') => {
      if (recipientMode === 'student' && !studentId) {
        throw new Error('Please select an enrolled student')
      }
      if (recipientMode === 'lead' && !leadName.trim()) {
        throw new Error('Please enter lead / prospect name')
      }
      if (items.some((it) => !it.description.trim())) {
        throw new Error('All line items must have a description')
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
            'Quotation will be generated, but company default settings could not be updated.'
          )
        }
      }

      // 1. Authoritative server-side calculation
      const serverCalculated = calculateQuotationTotals(
        items,
        overallDiscount,
        gstPercent
      )

      let quotationId = initialQuotation?.id
      let quoteNo = initialQuotation?.quote_no

      if (!isEditing) {
        if (manualQuoteNo.trim()) {
          const digitsOnly = manualQuoteNo.trim().replace(/\D/g, '')
          if (!digitsOnly || parseInt(digitsOnly, 10) <= 0) {
            throw new Error('Manual quotation number must be a positive whole number')
          }
          const num = parseInt(digitsOnly, 10)
          quoteNo = `AV/QT/${String(num).padStart(5, '0')}`
        } else {
          // 2. Generate sequential quotation number via Phase 4 engine
          quoteNo = await generateQuotationNumber(supabase)
        }

        const { data: newQuote, error: insertError } = await supabase
          .from('quotations')
          .insert({
            quote_no: quoteNo,
            student_id: recipientMode === 'student' ? studentId : null,
            lead_name: recipientMode === 'lead' ? leadName.trim() : (studentsList?.find((s) => s.id === studentId)?.name || null),
            lead_phone: recipientMode === 'lead' ? leadPhone.trim() : (studentsList?.find((s) => s.id === studentId)?.phone || null),
            lead_email: recipientMode === 'lead' ? leadEmail.trim() : (studentsList?.find((s) => s.id === studentId)?.email || null),
            quote_date: quoteDate,
            valid_until: validUntil || null,
            status,
            subtotal: serverCalculated.subtotal,
            discount_amount: serverCalculated.discountAmount,
            gst_percent: serverCalculated.gstPercent,
            gst_amount: serverCalculated.gstAmount,
            total: serverCalculated.total,
            terms_text: termsText.trim() || null,
          })
          .select('id, quote_no')
          .single()

        if (insertError) {
          if (
            insertError.code === '23505' ||
            insertError.message?.toLowerCase().includes('quote_no') ||
            insertError.message?.toLowerCase().includes('unique')
          ) {
            throw new Error(`Quotation number ${quoteNo} is already in use`)
          }
          throw insertError
        }

        quotationId = newQuote.id

        // Resync sequence if manual quote number is provided
        if (manualQuoteNo.trim()) {
          const digitsOnly = manualQuoteNo.trim().replace(/\D/g, '')
          const parsedNum = parseInt(digitsOnly, 10)
          if (!isNaN(parsedNum) && parsedNum > 0) {
            await supabase.rpc('resync_numbering_sequence', {
              p_doc_type: 'QT',
              p_fy_label: 'GLOBAL',
              p_new_last_number: parsedNum,
            })
          }
        }
      } else {
        // Update existing quotation
        const { error: updateError } = await supabase
          .from('quotations')
          .update({
            student_id: recipientMode === 'student' ? studentId : null,
            lead_name: recipientMode === 'lead' ? leadName.trim() : null,
            lead_phone: recipientMode === 'lead' ? leadPhone.trim() : null,
            lead_email: recipientMode === 'lead' ? leadEmail.trim() : null,
            quote_date: quoteDate,
            valid_until: validUntil || null,
            status: initialQuotation.status === 'draft' ? status : initialQuotation.status,
            subtotal: serverCalculated.subtotal,
            discount_amount: serverCalculated.discountAmount,
            gst_percent: serverCalculated.gstPercent,
            gst_amount: serverCalculated.gstAmount,
            total: serverCalculated.total,
            terms_text: termsText.trim() || null,
          })
          .eq('id', quotationId)

        if (updateError) throw updateError

        // Delete old items before re-inserting
        await supabase.from('quotation_items').delete().eq('quotation_id', quotationId)
      }

      // 3. Insert line items
      const lineItemInserts = serverCalculated.recalculatedItems.map((it) => ({
        quotation_id: quotationId,
        description: it.description.trim(),
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount,
        line_total: it.line_total,
      }))

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(lineItemInserts)

      if (itemsError) throw itemsError

      return { id: quotationId, quoteNo }
    },
    onError: (err: Error) => {
      toastError('Failed to save quotation', err.message)
    },
    onSuccess: (data) => {
      success(
        isEditing
          ? `Quotation ${data.quoteNo} updated successfully`
          : `Quotation ${data.quoteNo} created successfully`
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.quotations.all })
      if (data?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.quotations.detail(data.id) })
      }
      router.push(`/quotations/${data.id}`)
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
            href="/quotations"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Fee Management / Quotations
            </span>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              {isEditing
                ? `Edit Quotation (${initialQuotation.quote_no})`
                : 'Create Fee Quotation'}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => saveQuotationMutation.mutate('draft')}
            disabled={saveQuotationMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saveQuotationMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save as Draft
          </button>

          <button
            type="button"
            onClick={() => saveQuotationMutation.mutate('sent')}
            disabled={saveQuotationMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {saveQuotationMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save & Mark as Sent
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Recipient Selection */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <User className="w-4 h-4 text-navy-700" />
                Recipient Information
              </h3>

              {/* Mode Toggle: Student vs Lead */}
              <div className="flex items-center bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRecipientMode('student')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    recipientMode === 'student'
                      ? 'bg-white text-navy-900 shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Registered Student
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientMode('lead')}
                  className={`px-3 py-1 rounded-md transition-colors cursor-pointer ${
                    recipientMode === 'lead'
                      ? 'bg-white text-navy-900 shadow-2xs'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  New Prospect / Lead
                </button>
              </div>
            </div>

            {recipientMode === 'student' ? (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Enrolled Student *
                </label>
                <SearchableStudentSelect
                  students={studentsList || []}
                  value={studentId}
                  onChange={(id) => setStudentId(id)}
                  placeholder="-- Choose a student --"
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Prospect Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={leadPhone}
                    onChange={(e) => setLeadPhone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    placeholder="rahul@example.com"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-gray-100">

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Quotation Date
                </label>
                <input
                  type="date"
                  required
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Valid Until
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              {!isEditing && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quotation Number (Optional)
                  </label>
                  <div className="flex items-center rounded-lg border border-gray-300 bg-gray-50 focus-within:ring-1 focus-within:ring-accent focus-within:border-accent overflow-hidden shadow-2xs">
                    <span className="px-3 py-2 text-xs font-mono font-bold text-gray-600 bg-gray-100 border-r border-gray-200 select-none shrink-0">
                      AV/QT/
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="e.g. 321"
                      value={manualQuoteNo}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '')
                        setManualQuoteNo(val)
                      }}
                      className="w-full bg-white px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none"
                    />
                  </div>
                  <p className="text-2xs text-gray-400 mt-1">
                    Leave blank to auto-generate. Enter number only (e.g. 321 → AV/QT/00321).
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Itemized Line Items */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-navy-700" />
                  Itemized Programs & Fee Breakdown
                </h3>
                <span className="text-2xs text-gray-400">
                  Dynamic line items with live real-time price & discount calculations
                </span>
              </div>

              <button
                type="button"
                onClick={handleAddItem}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-navy-800 bg-navy-50 hover:bg-navy-100 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item Row
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => {
                const lineTotal = Math.max(
                  0,
                  (Number(item.quantity) || 0) * (Number(item.unit_price) || 0) -
                    (Number(item.discount_amount) || 0)
                )

                return (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3"
                  >
                    {/* Optional Prefill Dropdown from Course Terms */}
                    {coursesWithTerms && coursesWithTerms.length > 0 && (
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-200/60">
                        <span className="text-2xs font-semibold text-gray-500 flex items-center gap-1">
                          <GraduationCap className="w-3 h-3" /> Quick Pre-fill:
                        </span>
                        <select
                          onChange={(e) => {
                            const [cId, tId] = e.target.value.split('|')
                            if (cId && tId) handlePrefillCourseTerm(index, cId, tId)
                          }}
                          className="text-2xs rounded border border-gray-300 bg-white px-2 py-0.5"
                          defaultValue=""
                        >
                          <option value="" disabled>
                            -- Select Course & Term structure --
                          </option>
                          {coursesWithTerms.map((c) => (
                            <optgroup key={c.id} label={c.name}>
                              {c.course_terms?.map((t) => (
                                <option key={t.id} value={`${c.id}|${t.id}`}>
                                  {t.term_label} ({formatCurrency(t.term_fee)})
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Description / Service *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Commercial Pilot License (CPL) - Ground School Term 1"
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

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Unit Price (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          required
                          placeholder="Enter unit price"
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          onChange={(e) =>
                            handleUpdateItem(index, {
                              unit_price: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Line Disc (₹)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="Enter line discount"
                          value={item.discount_amount === 0 ? '' : item.discount_amount}
                          onChange={(e) =>
                            handleUpdateItem(index, {
                              discount_amount: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-12 sm:col-span-1 flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                        <div className="sm:hidden text-xs text-gray-500">
                          Total: <strong className="text-gray-900">{formatCurrency(lineTotal)}</strong>
                        </div>
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

          {/* Card 3: Terms and Conditions */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-navy-700" />
              Terms & Conditions
            </h3>
            <textarea
              rows={4}
              placeholder="Enter quotation terms and conditions..."
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 text-xs shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          {/* Card 4: Company & Document Details (Editable Panel) */}
          <CompanyDetailsPanel onChange={setCompanyDetails} initialCollapsed={true} />
        </div>

        {/* Right Sidebar: Live Real-Time Calculated Summary */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 sticky top-24">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sparkles className="w-4 h-4 text-navy-800" />
              <h3 className="text-sm font-bold text-gray-900">Quotation Summary</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross Line Subtotal</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.subtotal)}
                </span>
              </div>

              {/* Overall Discount Input */}
              <div className="space-y-1 pt-2 border-t border-gray-100">
                <label className="block text-2xs font-medium text-gray-600">
                  Overall Special Discount (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Enter discount amount"
                  value={overallDiscount === 0 ? '' : overallDiscount}
                  onChange={(e) =>
                    setOverallDiscount(e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              {/* GST Percent Input */}
              <div className="space-y-1">
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

              <div className="flex justify-between text-gray-600 pt-2 border-t border-gray-100">
                <span>GST Tax Value ({totals.gstPercent}%)</span>
                <span className="font-semibold text-gray-900">
                  {formatCurrency(totals.gstAmount)}
                </span>
              </div>

              {/* Net Grand Total */}
              <div className="p-4 rounded-xl bg-navy-50/70 border border-navy-100 flex items-center justify-between text-navy-950">
                <span className="text-xs font-bold uppercase tracking-wider">Total Value</span>
                <span className="text-xl font-extrabold text-navy-900">
                  {formatCurrency(totals.total)}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => saveQuotationMutation.mutate('sent')}
                disabled={saveQuotationMutation.isPending}
                className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saveQuotationMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {isEditing ? 'Update & Save' : 'Generate & Issue Quote'}
              </button>

              <button
                type="button"
                onClick={() => saveQuotationMutation.mutate('draft')}
                disabled={saveQuotationMutation.isPending}
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
