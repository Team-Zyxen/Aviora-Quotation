'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { calculatePayrollTotals } from '@/lib/payroll/calculations'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  Banknote,
  Plus,
  Edit2,
  Calendar,
  Download,
  FileText,
  Loader2,
  MinusCircle,
  PlusCircle,
  Clock,
} from 'lucide-react'
import type { FacultySalaryStructure, Payslip } from '@/types/database'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface FacultySalarySectionProps {
  facultyId: string
}

export function FacultySalarySection({ facultyId }: FacultySalarySectionProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form State for Adding a New Dated Salary Structure Row
  const [basic, setBasic] = useState<number>(50000)
  const [hra, setHra] = useState<number>(20000)
  const [otherAllowances, setOtherAllowances] = useState<number>(10000)
  const [pfDeduction, setPfDeduction] = useState<number>(3000)
  const [ptDeduction, setPtDeduction] = useState<number>(200)
  const [tdsDeduction, setTdsDeduction] = useState<number>(5000)
  const [otherDeductions, setOtherDeductions] = useState<number>(0)
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0]
  )

  // 1. Fetch current effective salary structure (latest effective_from <= CURRENT_DATE)
  const { data: salaryStructure, isLoading: loadingStructure } = useQuery({
    queryKey: queryKeys.faculty.salaryStructure(facultyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('faculty_salary_structures')
        .select('*')
        .eq('faculty_id', facultyId)
        .order('effective_from', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return (data || null) as FacultySalaryStructure | null
    },
  })

  // 2. Fetch past payslip history for this faculty member
  const { data: payslips = [], isLoading: loadingPayslips } = useQuery({
    queryKey: queryKeys.faculty.payslipHistory(facultyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select('*')
        .eq('faculty_id', facultyId)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (error) throw error
      return (data || []) as Payslip[]
    },
  })

  // Pre-fill form when modal opens if a structure already exists
  const handleOpenModal = () => {
    if (salaryStructure) {
      setBasic(salaryStructure.basic)
      setHra(salaryStructure.hra)
      setOtherAllowances(salaryStructure.other_allowances)
      setPfDeduction(salaryStructure.pf_deduction)
      setPtDeduction(salaryStructure.pt_deduction)
      setTdsDeduction(salaryStructure.tds_deduction)
      setOtherDeductions(salaryStructure.other_deductions || 0)
      setEffectiveFrom(salaryStructure.effective_from || new Date().toISOString().split('T')[0])
    } else {
      setBasic(50000)
      setHra(20000)
      setOtherAllowances(10000)
      setPfDeduction(3000)
      setPtDeduction(200)
      setTdsDeduction(5000)
      setOtherDeductions(0)
      setEffectiveFrom(new Date().toISOString().split('T')[0])
    }
    setIsModalOpen(true)
  }

  // Create New Salary Structure Row Mutation (preserves historical rows)
  const createStructureMutation = useMutation({
    mutationFn: async (e: React.FormEvent) => {
      e.preventDefault()

      if (!effectiveFrom) {
        throw new Error('Effective From date is required')
      }

      const { data, error } = await supabase
        .from('faculty_salary_structures')
        .insert({
          faculty_id: facultyId,
          basic: Number(basic) || 0,
          hra: Number(hra) || 0,
          other_allowances: Number(otherAllowances) || 0,
          pf_deduction: Number(pfDeduction) || 0,
          pt_deduction: Number(ptDeduction) || 0,
          tds_deduction: Number(tdsDeduction) || 0,
          other_deductions: Number(otherDeductions) || 0,
          effective_from: effectiveFrom,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onError: (err: Error) => {
      toastError('Failed to save salary structure', err.message)
    },
    onSuccess: async (newRecord) => {
      success('New salary structure effective date saved successfully')
      setIsModalOpen(false)
      if (newRecord) {
        queryClient.setQueryData(queryKeys.faculty.salaryStructure(facultyId), newRecord)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.faculty.salaryStructure(facultyId), refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: queryKeys.faculty.detail(facultyId), refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: queryKeys.faculty.all, refetchType: 'all' }),
      ])
    },
  })

  const totals = calculatePayrollTotals(salaryStructure)

  if (loadingStructure || loadingPayslips) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Sub-Section 1: Salary Structure Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-navy-50 text-navy-800 flex items-center justify-center">
              <Banknote className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Configured Salary Structure</h3>
              <span className="text-2xs text-gray-400">
                Effective base pay and statutory deductions for monthly payroll calculation
              </span>
            </div>
          </div>

          <button
            onClick={handleOpenModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {salaryStructure ? 'Update Salary Structure' : 'Set Salary Structure'}
          </button>
        </div>

        {!salaryStructure ? (
          <div className="p-8 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
            <Banknote className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <h4 className="text-xs font-semibold text-gray-800">No Salary Structure Configured</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Click "Set Salary Structure" above to define Basic Pay, HRA, and deductions.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between text-2xs text-gray-500 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 font-mono">
              <span>Effective Date: <strong>{salaryStructure.effective_from}</strong></span>
              <span>History Preserved: Updates create dated revisions</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Gross Earnings Breakdown */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-600" /> Gross Earnings Breakdown
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
                    <span>Gross Pay</span>
                    <span className="font-mono">{formatCurrency(totals.grossPay)}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Breakdown */}
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800 flex items-center gap-1">
                  <MinusCircle className="w-3.5 h-3.5 text-rose-600" /> Statutory Deductions Breakdown
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
                  <div className="flex justify-between font-bold text-rose-950 pt-2 border-t border-rose-200 text-sm">
                    <span>Total Deductions</span>
                    <span className="font-mono">{formatCurrency(totals.totalDeductions)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sub-Section 2: Generated Payslip History */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">Faculty Payslip History</h3>
              <span className="text-2xs text-gray-400">
                Frozen monthly payroll records and downloadable payslip PDFs
              </span>
            </div>
          </div>

          <Link
            href={`/payslips/new?faculty_id=${facultyId}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Generate Payslip
          </Link>
        </div>

        {payslips.length === 0 ? (
          <div className="p-8 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200">
            <FileText className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <h4 className="text-xs font-semibold text-gray-800">No Payslips Generated Yet</h4>
            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
              Generated monthly payslips will appear here with frozen salary snapshots.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Payslip Ref</th>
                  <th scope="col" className="px-4 py-2.5">Payroll Month</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Gross Pay</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Deductions</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Net Payable</th>
                  <th scope="col" className="px-4 py-2.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payslips.map((p) => {
                  const monthName = MONTH_NAMES[(p.month || 1) - 1]

                  return (
                    <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-navy-800">
                        {p.payslip_no}
                      </td>

                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {monthName} {p.year}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                        {formatCurrency(p.gross_pay)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono text-rose-700">
                        - {formatCurrency(p.total_deductions)}
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-navy-950">
                        {formatCurrency(p.net_pay)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <a
                          href={`/api/payslips/${p.id}/pdf`}
                          download
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold text-navy-800 bg-navy-50 hover:bg-navy-100 rounded-md transition-colors"
                          title="Download Payslip PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Payslip
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Update / Add Dated Salary Structure Row */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">
              Update Faculty Salary Structure
            </h3>
            <p className="text-2xs text-gray-500">
              This action creates a new dated salary structure record effective from the chosen date. Historical payslips generated prior to this date remain unchanged.
            </p>

            <form onSubmit={(e) => createStructureMutation.mutate(e)} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium text-gray-700 mb-1">Basic Pay (₹) *</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    placeholder="Enter basic pay"
                    value={basic === 0 ? '' : basic}
                    onChange={(e) => setBasic(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">House Rent Allowance (HRA) (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter HRA"
                    value={hra === 0 ? '' : hra}
                    onChange={(e) => setHra(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Special / Other Allowances (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter allowances"
                    value={otherAllowances === 0 ? '' : otherAllowances}
                    onChange={(e) => setOtherAllowances(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Provident Fund (PF) (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter PF deduction"
                    value={pfDeduction === 0 ? '' : pfDeduction}
                    onChange={(e) => setPfDeduction(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Professional Tax (PT) (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter PT deduction"
                    value={ptDeduction === 0 ? '' : ptDeduction}
                    onChange={(e) => setPtDeduction(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div>
                  <label className="block font-medium text-gray-700 mb-1">Income Tax (TDS) (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter TDS deduction"
                    value={tdsDeduction === 0 ? '' : tdsDeduction}
                    onChange={(e) => setTdsDeduction(e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-medium text-gray-700 mb-1">Effective From Date *</label>
                  <input
                    type="date"
                    required
                    value={effectiveFrom}
                    onChange={(e) => setEffectiveFrom(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStructureMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  {createStructureMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save New Effective Structure
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
