'use client'

import React, { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { generatePayslip } from '@/lib/rpc/financial'
import { invalidateAfterPayslipGenerated } from '@/lib/rpc/invalidation'
import { generateIdempotencyKey } from '@/lib/utils/idempotency'
import { queryKeys } from '@/lib/query-keys'
import { calculatePayrollTotals } from '@/lib/payroll/calculations'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { SearchableFacultySelect } from '@/components/ui/SearchableFacultySelect'
import {
  FileText,
  ArrowLeft,
  User,
  Calendar,
  AlertTriangle,
  Sparkles,
  Loader2,
  CheckCircle2,
  Banknote,
  MinusCircle,
  PlusCircle,
} from 'lucide-react'
import {
  CompanyDetailsPanel,
  CompanyDetailsState,
  CompanyDetailsChangePayload,
  saveCompanySettings,
} from '@/components/shared/CompanyDetailsPanel'
import type { Faculty, FacultySalaryStructure } from '@/types/database'

const MONTHS = [
  { value: 1, name: 'January' },
  { value: 2, name: 'February' },
  { value: 3, name: 'March' },
  { value: 4, name: 'April' },
  { value: 5, name: 'May' },
  { value: 6, name: 'June' },
  { value: 7, name: 'July' },
  { value: 8, name: 'August' },
  { value: 9, name: 'September' },
  { value: 10, name: 'October' },
  { value: 11, name: 'November' },
  { value: 12, name: 'December' },
]

interface PayslipFormProps {
  prefillFacultyId?: string | null
}

export function PayslipForm({ prefillFacultyId }: PayslipFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  // Error Banner state for unmasked database exception strings
  const [formError, setFormError] = useState<string | null>(null)

  // Idempotency Key Ref generated once per submission attempt
  const idempotencyKeyRef = useRef<string | null>(null)

  const today = new Date()
  const [facultyId, setFacultyId] = useState<string>(prefillFacultyId || '')
  const [month, setMonth] = useState<number>(today.getMonth() + 1)
  const [year, setYear] = useState<number>(today.getFullYear())
  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsChangePayload | null>(null)

  // 1. Fetch active faculty directory via queryKeys registry
  const { data: facultyList, isLoading: loadingFaculty } = useQuery({
    queryKey: queryKeys.faculty.forPayslip,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faculty')
        .select('id, name, designation, department')
        .eq('active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return (data || []) as Faculty[]
    },
  })

  // End date of the payslip month (e.g. 2026-08-31)
  const lastDay = new Date(year, month, 0).getDate()
  const monthEndDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // 2. Fetch effective salary structure for live preview
  const { data: effectiveStructure, isLoading: loadingStructure } = useQuery({
    queryKey: queryKeys.faculty.effectiveStructure(facultyId, monthEndDate),
    enabled: !!facultyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faculty_salary_structures')
        .select('*')
        .eq('faculty_id', facultyId)
        .lte('effective_from', monthEndDate)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      if (data) return data as FacultySalaryStructure

      const { data: latestData } = await supabase
        .from('faculty_salary_structures')
        .select('*')
        .eq('faculty_id', facultyId)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      return (latestData || null) as FacultySalaryStructure | null
    },
  })

  // 3. Check for existing duplicate payslip in UI preview
  const { data: existingPayslip } = useQuery({
    queryKey: queryKeys.payslips.duplicateCheck(facultyId, month, year),
    enabled: !!facultyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select('id, payslip_no, generated_at')
        .eq('faculty_id', facultyId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle()

      if (error) throw error
      return data || null
    },
  })

  // Compute live payroll totals for instant client feedback preview
  const totals = calculatePayrollTotals(effectiveStructure)
  const isDuplicate = !!existingPayslip

  // Generate Payslip Mutation (Authoritative generate_payslip execution)
  const generatePayslipMutation = useMutation({
    mutationFn: async () => {
      setFormError(null)

      if (!facultyId) throw new Error('Please select a faculty member')
      if (!month || !year) throw new Error('Please select a valid payroll period')
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
            'Payslip will be generated, but company default settings could not be updated.'
          )
        }
      }

      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey()
      }

      // Call Phase A RPC wrapper for generate_payslip
      const result = await generatePayslip({
        facultyId,
        month,
        year,
        idempotencyKey: idempotencyKeyRef.current,
      })

      return result
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toastError('Payslip generation failed', err.message)
    },
    onSuccess: async (result) => {
      idempotencyKeyRef.current = null
      success(`Payslip ${result.payslip_no} generated successfully`)

      // Invalidate targeted queries using Phase A invalidation helper
      await invalidateAfterPayslipGenerated(queryClient, { facultyId })

      router.push(`/faculty/${facultyId}`)
    },
  })

  if (loadingFaculty) {
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
            href="/payslips"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Faculty Payroll / Payslips
            </span>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-0.5">
              Generate Monthly Faculty Payslip
            </h1>
          </div>
        </div>
      </div>

      {/* Error Banner for Unmasked Database Exception Strings */}
      {formError && (
        <ErrorBanner
          error={formError}
          title="Payroll Exception"
          onDismiss={() => setFormError(null)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Faculty & Period Selector */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <User className="w-4 h-4 text-navy-700" />
              Faculty Member & Payroll Month
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Select Faculty Member *
                </label>
                <SearchableFacultySelect
                  faculty={facultyList || []}
                  value={facultyId}
                  onChange={(id) => setFacultyId(id)}
                  placeholder="-- Choose faculty --"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payroll Month *
                </label>
                <select
                  value={month}
                  onChange={(e) => setMonth(parseInt(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payroll Year *
                </label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                >
                  {[2025, 2026, 2027, 2028].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Warning Banners */}
            {isDuplicate && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">Payslip Already Generated</strong>
                  <span>
                    A payslip (<code className="font-mono font-bold">{existingPayslip.payslip_no}</code>) has already been generated for this faculty member for {MONTHS.find((m) => m.value === month)?.name} {year}. Duplicate payslips cannot be generated.
                  </span>
                </div>
              </div>
            )}

            {facultyId && !loadingStructure && !effectiveStructure && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-bold">No Effective Salary Structure Found</strong>
                  <span>
                    No salary structure configured for this faculty member effective on or before {monthEndDate}. An active salary structure is required.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Live Structure Breakdown */}
          {facultyId && effectiveStructure && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-navy-700" />
                  Effective Salary Structure Snapshot
                </h3>
                <span className="text-2xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  Effective From: {effectiveStructure.effective_from}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Gross Earnings Table */}
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600" /> Gross Earnings
                  </span>
                  <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Basic Pay</span>
                      <span className="font-mono font-semibold">{formatCurrency(totals.basic)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">House Rent Allowance (HRA)</span>
                      <span className="font-mono font-semibold">{formatCurrency(totals.hra)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Special & Flight Allowances</span>
                      <span className="font-mono font-semibold">{formatCurrency(totals.otherAllowances)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-900 pt-2 border-t border-emerald-200 text-sm">
                      <span>Total Gross Pay</span>
                      <span className="font-mono">{formatCurrency(totals.grossPay)}</span>
                    </div>
                  </div>
                </div>

                {/* Deductions Table */}
                <div className="space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                    <MinusCircle className="w-3.5 h-3.5 text-rose-600" /> Statutory Deductions
                  </span>
                  <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Provident Fund (PF)</span>
                      <span className="font-mono font-semibold text-rose-700">{formatCurrency(totals.pfDeduction)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Professional Tax (PT)</span>
                      <span className="font-mono font-semibold text-rose-700">{formatCurrency(totals.ptDeduction)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Income Tax (TDS)</span>
                      <span className="font-mono font-semibold text-rose-700">{formatCurrency(totals.tdsDeduction)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Other Deductions</span>
                      <span className="font-mono font-semibold text-rose-700">{formatCurrency(totals.otherDeductions)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-rose-950 pt-2 border-t border-rose-200 text-sm">
                      <span>Total Deductions</span>
                      <span className="font-mono">{formatCurrency(totals.totalDeductions)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Card 3: Company & Document Details (Editable Panel) */}
          <CompanyDetailsPanel onChange={setCompanyDetails} initialCollapsed={true} />
        </div>

        {/* Right Sidebar: Live Net Payable Calculation */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 sticky top-24">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sparkles className="w-4 h-4 text-navy-800" />
              <h3 className="text-sm font-bold text-gray-900">Payslip Summary</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross Monthly Earnings</span>
                <span className="font-mono font-semibold text-gray-900">
                  {formatCurrency(totals.grossPay)}
                </span>
              </div>

              <div className="flex justify-between text-rose-700">
                <span>Total Statutory Deductions</span>
                <span className="font-mono font-semibold">
                  - {formatCurrency(totals.totalDeductions)}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-navy-900 text-white space-y-1">
                <span className="text-2xs font-bold uppercase tracking-wider text-sky-400 block">
                  Net Salary Payable
                </span>
                <div className="text-2xl font-extrabold font-mono text-white">
                  {formatCurrency(totals.netPay)}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => generatePayslipMutation.mutate()}
              disabled={
                generatePayslipMutation.isPending ||
                !facultyId ||
                !effectiveStructure
              }
              className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generatePayslipMutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Generate Faculty Payslip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
