'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { exportToCsv } from '@/lib/utils/csv'
import { StatusBadge, type StatusType } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  FileSpreadsheet,
  Download,
  Filter,
  Search,
  Calendar,
  CreditCard,
  GraduationCap,
  Banknote,
  AlertCircle,
  Receipt,
  Users,
} from 'lucide-react'
import type { Payment, Payslip } from '@/types/database'

type ReportTab = 'outstanding' | 'collections' | 'courses' | 'payroll'

export function ReportsClient() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<ReportTab>('outstanding')

  // Date Range Filters
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // 1. Outstanding Fees Query (students with balance_due > 0)
  const { data: outstandingData = [], isLoading: loadingOutstanding } = useQuery({
    queryKey: queryKeys.reports.outstanding({ startDate, endDate }),
    enabled: activeTab === 'outstanding',
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          id,
          invoice_no,
          invoice_date,
          due_date,
          grand_total,
          status,
          student_name,
          student_admission_no,
          student_phone,
          student_email,
          course_name,
          students (
            id,
            admission_no,
            name,
            phone,
            email
          ),
          enrollments (
            courses (
              name
            )
          )
        `)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })

      if (startDate) query = query.gte('invoice_date', startDate)
      if (endDate) query = query.lte('invoice_date', endDate)

      const { data: rawInvoices, error: invErr } = await query
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
            computed_status: inv.status || 'draft',
          },
        }))
        .filter((inv: any) => Number(inv.invoice_balances.balance_due) > 0)

      return invoices as any[]
    },
  })

  // 2. Collection Report Query (Payments filterable by date)
  const { data: collectionsData = [], isLoading: loadingCollections } = useQuery({
    queryKey: queryKeys.reports.collections({ startDate, endDate }),
    enabled: activeTab === 'collections',
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select(`
          *,
          students (
            admission_no,
            name,
            phone
          ),
          invoices (
            invoice_no,
            student_name,
            student_admission_no
          )
        `)
        .order('payment_date', { ascending: false })

      if (startDate) query = query.gte('payment_date', startDate)
      if (endDate) query = query.lte('payment_date', endDate)

      const { data, error } = await query
      if (error) throw error
      return (data || []) as unknown as Payment[]
    },
  })

  // 3. Course-wise Fee Report Query
  const { data: courseReportData = [], isLoading: loadingCourseReport } = useQuery({
    queryKey: queryKeys.reports.courses({ startDate, endDate }),
    enabled: activeTab === 'courses',
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          id,
          invoice_date,
          grand_total,
          status,
          course_name,
          enrollments (
            courses (
              id,
              name
            )
          )
        `)
        .neq('status', 'cancelled')

      if (startDate) query = query.gte('invoice_date', startDate)
      if (endDate) query = query.lte('invoice_date', endDate)

      const { data: rawInvoices, error: invErr } = await query
      if (invErr) throw invErr
      if (!rawInvoices || rawInvoices.length === 0) return []

      const invIds = rawInvoices.map((i) => i.id)
      const { data: rawBalances, error: balErr } = await supabase
        .from('invoice_balances')
        .select('*')
        .in('invoice_id', invIds)

      if (balErr) throw balErr

      const balancesMap = new Map((rawBalances || []).map((b: any) => [b.invoice_id, b]))

      const courseMap = new Map<
        string,
        { name: string; billed: number; collected: number; outstanding: number; count: number }
      >()

      ;(rawInvoices || []).forEach((inv: any) => {
        const courseName = inv.course_name || (inv.enrollments as any)?.courses?.name || 'Unassigned Track'
        const courseId = (inv.enrollments as any)?.courses?.id || courseName

        const bal = balancesMap.get(inv.id)
        const billed = Number(bal?.grand_total) || 0
        const collected = Number(bal?.amount_paid) || 0
        const outstanding = Number(bal?.balance_due) || 0

        const existing = courseMap.get(courseId) || {
          name: courseName,
          billed: 0,
          collected: 0,
          outstanding: 0,
          count: 0,
        }

        courseMap.set(courseId, {
          name: courseName,
          billed: existing.billed + billed,
          collected: existing.collected + collected,
          outstanding: existing.outstanding + outstanding,
          count: existing.count + 1,
        })
      })

      return Array.from(courseMap.values())
    },
  })

  // 4. Payroll Report Query
  const { data: payrollReportData = [], isLoading: loadingPayrollReport } = useQuery({
    queryKey: queryKeys.reports.payroll({ startDate, endDate }),
    enabled: activeTab === 'payroll',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payslips')
        .select(`
          *,
          faculty (
            name,
            designation,
            department
          )
        `)
        .order('year', { ascending: false })
        .order('month', { ascending: false })

      if (error) throw error
      return (data || []) as unknown as Payslip[]
    },
  })

  // Export CSV Handlers
  const exportOutstandingCSV = () => {
    const headers = ['Student ID', 'Student Name', 'Phone', 'Program', 'Invoice Ref', 'Grand Total (INR)', 'Amount Paid (INR)', 'Balance Due (INR)', 'Status']
    const rows = outstandingData.map((inv) => [
      inv.student_admission_no || inv.students?.admission_no || 'N/A',
      inv.students?.name || inv.student_name_snapshot || inv.student_name || 'Historical Student',
      inv.student_phone || inv.students?.phone || 'N/A',
      inv.course_name || inv.enrollments?.courses?.name || 'Academic Program',
      inv.invoice_no,
      inv.invoice_balances?.grand_total || inv.grand_total,
      inv.invoice_balances?.amount_paid || 0,
      inv.invoice_balances?.balance_due || 0,
      inv.invoice_balances?.computed_status || inv.status,
    ])
    exportToCsv(`outstanding_fees_report_${new Date().toISOString().split('T')[0]}`, headers, rows)
  }

  const exportCollectionsCSV = () => {
    const headers = ['Receipt No', 'Payment Date', 'Student ID', 'Student Name', 'Invoice Ref', 'Payment Mode', 'Reference No', 'Amount Paid (INR)']
    const rows = collectionsData.map((p: any) => [
      p.receipt_no,
      p.payment_date,
      p.student_admission_no || p.students?.admission_no || p.invoices?.student_admission_no || 'N/A',
      p.students?.name || p.student_name_snapshot || p.student_name || p.invoices?.student_name_snapshot || 'Historical Student',
      p.invoices?.invoice_no || '',
      p.payment_mode ? p.payment_mode.replace('_', ' ').toUpperCase() : 'BANK TRANSFER',
      p.reference_no || 'Direct',
      p.amount,
    ])
    exportToCsv(`collection_report_${new Date().toISOString().split('T')[0]}`, headers, rows)
  }

  const exportCourseCSV = () => {
    const headers = ['Course Program', 'Invoices Count', 'Total Billed (INR)', 'Total Collected (INR)', 'Total Outstanding (INR)', 'Collection Rate (%)']
    const rows = courseReportData.map((c) => {
      const rate = c.billed > 0 ? Math.round((c.collected / c.billed) * 100) : 0
      return [c.name, c.count, c.billed, c.collected, c.outstanding, `${rate}%`]
    })
    exportToCsv(`course_wise_fee_report_${new Date().toISOString().split('T')[0]}`, headers, rows)
  }

  const exportPayrollCSV = () => {
    const headers = ['Payslip Ref', 'Month/Year', 'Faculty Name', 'Designation', 'Department', 'Gross Pay (INR)', 'Total Deductions (INR)', 'Net Pay (INR)']
    const rows = payrollReportData.map((p) => [
      p.payslip_no,
      `${p.month}/${p.year}`,
      p.faculty?.name || '',
      p.faculty?.designation || '',
      p.faculty?.department || '',
      p.gross_pay,
      p.total_deductions,
      p.net_pay,
    ])
    exportToCsv(`payroll_report_${new Date().toISOString().split('T')[0]}`, headers, rows)
  }

  return (
    <div className="space-y-6">
      {/* 1. Page Heading & Subtitle */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Financial &amp; Audit Reports Hub
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Exportable ledger reports, outstanding balances, collections history, and payroll registers.
        </p>
      </div>

      {/* 2. Tab Navigation Bar (Placed BETWEEN Heading and Report Content Card) */}
      <div className="border-b border-gray-200 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto min-w-0 py-1">
          {[
            { id: 'outstanding', label: 'Outstanding Fees' },
            { id: 'collections', label: 'Collections History' },
            { id: 'courses', label: 'Course Performance' },
            { id: 'payroll', label: 'Payroll Register' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ReportTab)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-navy-800 text-white shadow-xs ring-2 ring-navy-800/20'
                  : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Filter Bar for Collections & Course Reports */}
      {(activeTab === 'collections' || activeTab === 'courses') && (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="font-semibold text-gray-700">Date Range Filter:</span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-gray-500">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-gray-500">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-1.5 shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
              className="text-xs text-rose-600 hover:underline cursor-pointer"
            >
              Clear Filter
            </button>
          )}
        </div>
      )}

      {/* 3. Report Content Cards */}

      {/* Tab 1: Outstanding Fees Report */}
      {activeTab === 'outstanding' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-4">
          <div className="p-6 pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                Unsettled Outstanding Fees Register
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Students with balance_due &gt; 0 across all active term invoices
              </p>
            </div>

            <button
              onClick={exportOutstandingCSV}
              disabled={outstandingData.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>

          {loadingOutstanding ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : outstandingData.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              No outstanding fee balances found! All invoices are fully settled.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-2xs uppercase">
                  <tr>
                    <th className="px-6 py-3">Admission No</th>
                    <th className="px-6 py-3">Student Name</th>
                    <th className="px-6 py-3">Phone</th>
                    <th className="px-6 py-3">Program Track</th>
                    <th className="px-6 py-3">Invoice Ref</th>
                    <th className="px-6 py-3 text-right">Grand Total</th>
                    <th className="px-6 py-3 text-right">Paid</th>
                    <th className="px-6 py-3 text-right">Balance Due</th>
                    <th className="px-6 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {outstandingData.map((inv, idx) => {
                    const studentName =
                      inv.students?.name || inv.student_name_snapshot || inv.student_name || 'Historical Student'
                    const admissionNo = inv.student_admission_no || inv.students?.admission_no || 'N/A'
                    const phone = inv.student_phone || inv.students?.phone || 'N/A'
                    const courseName = inv.course_name || inv.enrollments?.courses?.name || 'Academic Program'
                    const balances = inv.invoice_balances

                    return (
                      <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-mono font-bold text-navy-800">
                          {admissionNo}
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-gray-900">
                          {studentName}
                        </td>
                        <td className="px-6 py-3.5 text-gray-600">{phone}</td>
                        <td className="px-6 py-3.5 text-gray-600">{courseName}</td>
                        <td className="px-6 py-3.5 font-mono text-navy-700">{inv.invoice_no}</td>
                        <td className="px-6 py-3.5 text-right font-mono font-semibold text-gray-900">
                          {formatCurrency(balances?.grand_total || inv.grand_total)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-emerald-700">
                          {formatCurrency(balances?.amount_paid || 0)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-rose-700">
                          {formatCurrency(balances?.balance_due || 0)}
                        </td>
                        <td className="px-6 py-3.5 text-center">
                          <StatusBadge status={(balances?.computed_status || inv.status) as StatusType} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Collections History Report */}
      {activeTab === 'collections' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-4">
          <div className="p-6 pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                Fee Collections &amp; Payment Register
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Student fee payments, bank transactions, and generated receipts
              </p>
            </div>

            <button
              onClick={exportCollectionsCSV}
              disabled={collectionsData.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>

          {loadingCollections ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : collectionsData.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              No collection receipts recorded in the selected date range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-2xs uppercase">
                  <tr>
                    <th className="px-6 py-3">Receipt No</th>
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Student Name</th>
                    <th className="px-6 py-3">Invoice Ref</th>
                    <th className="px-6 py-3">Payment Mode</th>
                    <th className="px-6 py-3">Transaction Ref</th>
                    <th className="px-6 py-3 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {collectionsData.map((p: any, idx) => {
                    const studentName = p.student_name || p.students?.name || p.invoices?.student_name || 'Historical Student'
                    return (
                      <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-mono font-bold text-navy-800">{p.receipt_no}</td>
                        <td className="px-6 py-3.5 text-gray-600">{p.payment_date}</td>
                        <td className="px-6 py-3.5 font-semibold text-gray-900">{studentName}</td>
                        <td className="px-6 py-3.5 font-mono text-navy-700">{p.invoices?.invoice_no}</td>
                        <td className="px-6 py-3.5 uppercase font-semibold text-emerald-800">
                          {p.payment_mode ? p.payment_mode.replace('_', ' ') : 'BANK'}
                        </td>
                        <td className="px-6 py-3.5 font-mono text-gray-500">{p.reference_no || 'Direct'}</td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(p.amount)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Course-wise Fee Report */}
      {activeTab === 'courses' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-4">
          <div className="p-6 pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-navy-700" />
                Course Program Financial Audit Report
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Total term fees billed, payments collected, and net balances per academic program
              </p>
            </div>

            <button
              onClick={exportCourseCSV}
              disabled={courseReportData.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>

          {loadingCourseReport ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-2xs uppercase">
                  <tr>
                    <th className="px-6 py-3">Course Program Track</th>
                    <th className="px-6 py-3 text-center">Active Invoices</th>
                    <th className="px-6 py-3 text-right">Total Billed</th>
                    <th className="px-6 py-3 text-right">Total Collected</th>
                    <th className="px-6 py-3 text-right">Total Outstanding</th>
                    <th className="px-6 py-3 text-right">Collection Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {courseReportData.map((c, idx) => {
                    const rate = c.billed > 0 ? Math.round((c.collected / c.billed) * 100) : 0
                    return (
                      <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3.5 font-bold text-gray-900">{c.name}</td>
                        <td className="px-6 py-3.5 text-center text-gray-600">{c.count}</td>
                        <td className="px-6 py-3.5 text-right font-mono font-semibold text-gray-900">
                          {formatCurrency(c.billed)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-emerald-700">
                          {formatCurrency(c.collected)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-rose-700">
                          {formatCurrency(c.outstanding)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono font-extrabold text-navy-900">
                          {rate}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Payroll Register Report */}
      {activeTab === 'payroll' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-4">
          <div className="p-6 pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-navy-700" />
                Faculty Payroll &amp; Remuneration Audit Register
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Monthly gross earnings, statutory deductions, and net salary disbursements
              </p>
            </div>

            <button
              onClick={exportPayrollCSV}
              disabled={payrollReportData.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export to CSV
            </button>
          </div>

          {loadingPayrollReport ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200 text-2xs uppercase">
                  <tr>
                    <th className="px-6 py-3">Payslip Ref</th>
                    <th className="px-6 py-3">Month/Year</th>
                    <th className="px-6 py-3">Faculty Member</th>
                    <th className="px-6 py-3">Department</th>
                    <th className="px-6 py-3 text-right">Gross Pay</th>
                    <th className="px-6 py-3 text-right">Total Deductions</th>
                    <th className="px-6 py-3 text-right">Net Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {payrollReportData.map((p, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-3.5 font-mono font-bold text-navy-800">{p.payslip_no}</td>
                      <td className="px-6 py-3.5 font-semibold text-gray-700">{p.month}/{p.year}</td>
                      <td className="px-6 py-3.5 font-bold text-gray-900">{p.faculty?.name}</td>
                      <td className="px-6 py-3.5 text-gray-600">{p.faculty?.department}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-gray-900">{formatCurrency(p.gross_pay)}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-rose-700">- {formatCurrency(p.total_deductions)}</td>
                      <td className="px-6 py-3.5 text-right font-mono font-extrabold text-navy-950">{formatCurrency(p.net_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
