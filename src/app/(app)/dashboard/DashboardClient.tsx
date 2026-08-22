'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { getDashboardSummary, type DashboardPeriod } from '@/lib/rpc/reads'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  BarChart3,
  Receipt,
  CreditCard,
  Banknote,
  GraduationCap,
  Calendar,
  ArrowRight,
  FileSpreadsheet,
  AlertCircle,
  HelpCircle,
} from 'lucide-react'

export function DashboardClient() {
  const [period, setPeriod] = useState<DashboardPeriod>('all_time')
  const supabase = createClient()

  // Authoritative Single Read RPC Query for Executive Dashboard
  const { data: summary, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.dashboard(period),
    queryFn: () => getDashboardSummary(period),
  })

  // Completely separate query for Operational Expenses summary RPC
  const { data: expSummary } = useQuery({
    queryKey: queryKeys.expenses.summary,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_operational_expenses_summary')
      if (error) throw error
      return data as {
        total_this_month: number
        total_all_time: number
        category_breakdown_this_month: Array<{ category: string; total: number }>
      }
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-48" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <Skeleton className="h-96 lg:col-span-2 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Failed to load financial dashboard</h3>
        <p className="text-xs text-gray-500">
          {(error as Error)?.message || 'An unexpected error occurred while loading dashboard.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Executive Financial Dashboard
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Authoritative real-time financial summary
          </p>
        </div>

        {/* Period Selector Toggle */}
        <div className="inline-flex p-1 bg-gray-100/80 rounded-xl border border-gray-200 shadow-2xs self-start sm:self-auto">
          <button
            onClick={() => setPeriod('this_month')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              period === 'this_month'
                ? 'bg-white text-navy-900 shadow-xs font-bold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            This Month
          </button>
          <button
            onClick={() => setPeriod('all_time')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              period === 'all_time'
                ? 'bg-white text-navy-900 shadow-xs font-bold'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Financial Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1: Billed for Period (Invoice-date based) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-gray-500">
              Total Invoiced Billed
            </span>
            <div className="w-8 h-8 rounded-lg bg-navy-50 text-navy-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl 2xl:text-3xl font-extrabold text-navy-950 font-mono">
            {formatCurrency(summary.billed_for_period)}
          </div>
          <p className="text-2xs text-gray-500 flex items-center gap-1">
            <Calendar className="w-3 h-3 text-gray-400" />
            Invoice-date based ({period === 'this_month' ? 'current month' : 'cumulative all time'})
          </p>
        </div>

        {/* Card 2: Collected for Period (Payment-date based) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-emerald-800">
              Total Fee Collected
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl 2xl:text-3xl font-extrabold text-emerald-700 font-mono">
            {formatCurrency(summary.collected_for_period)}
          </div>
          <p className="text-2xs text-emerald-700 flex items-center gap-1 font-medium">
            <Receipt className="w-3 h-3 text-emerald-600" />
            Payments received ({period === 'this_month' ? 'current month' : 'cumulative all time'})
          </p>
        </div>

        {/* Card 3: Operational Expenses — clickable → /expenses */}
        <Link
          href="/expenses"
          className="block bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3 relative overflow-hidden cursor-pointer hover:border-purple-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xs font-bold uppercase tracking-wider text-purple-900">
              Operational Expenses
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl 2xl:text-3xl font-extrabold text-purple-950 font-mono">
            {formatCurrency(
              period === 'this_month'
                ? expSummary?.total_this_month || 0
                : expSummary?.total_all_time || 0
            )}
          </div>
          <p className="text-2xs text-purple-700 flex items-center gap-1 font-medium">
            <Receipt className="w-3 h-3 text-purple-600" />
            Business expenditures ({period === 'this_month' ? 'current month' : 'cumulative all time'})
          </p>
        </Link>

        {/* Card 4: Outstanding Current (Always Live / Current) — clickable → /reports */}
        <Link
          href="/reports"
          className="block bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3 relative overflow-hidden cursor-pointer hover:border-rose-300 hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-2xs font-bold uppercase tracking-wider text-rose-800">
                Total Balance Outstanding
              </span>
              <div
                className="group relative"
                title="Always live across all active invoices in system. Independent of period filter."
              >
                <HelpCircle className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl 2xl:text-3xl font-extrabold text-rose-700 font-mono">
            {formatCurrency(summary.outstanding_current)}
          </div>
          <p className="text-2xs text-gray-500 font-medium">
            Always live/current across all active tax invoices
          </p>
        </Link>
      </div>

      {/* Invoice Status Distribution Strip (Always Live / Current) */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-navy-700" />
            Live Invoice Status Counts
          </h3>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200">
            <span className="text-2xs font-semibold text-amber-800 block">Unpaid (Zero Payment)</span>
            <span className="text-lg font-mono font-bold text-amber-900">{summary.zero_payment_count}</span>
          </div>

          <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200">
            <span className="text-2xs font-semibold text-sky-800 block">Partial Payment</span>
            <span className="text-lg font-mono font-bold text-sky-900">{summary.partial_count}</span>
          </div>

          <div className="p-3 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <span className="text-2xs font-semibold text-emerald-800 block">Fully Paid</span>
            <span className="text-lg font-mono font-bold text-emerald-900">{summary.paid_count}</span>
          </div>

          <div className="p-3 rounded-lg bg-rose-50/70 border border-rose-200">
            <span className="text-2xs font-semibold text-rose-800 block">Overdue</span>
            <span className="text-lg font-mono font-bold text-rose-900">{summary.overdue_count}</span>
          </div>
        </div>
      </div>

      {/* Main Row 1: Recent Tax Invoices (2 Cols) & Course Program Breakdown (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Tax Invoices Feed (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-navy-700" />
              Recent Tax Invoices
            </h3>
            <Link href="/invoices" className="text-2xs font-semibold text-accent hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {summary.recent_invoices.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-4">No recent invoices found.</p>
          ) : (
            <div className="space-y-3">
              {summary.recent_invoices.map((inv) => (
                <div key={inv.id} className="p-3 rounded-lg bg-gray-50/70 border border-gray-100 flex items-center justify-between text-xs hover:bg-gray-100/60 transition-colors">
                  <div>
                    <Link href={`/invoices/${inv.id}`} className="font-mono font-bold text-navy-900 hover:underline">
                      {inv.invoice_no}
                    </Link>
                    <span className="text-2xs text-gray-500 block">
                      {(inv as any).student_name || (inv as any).student_name_snapshot || 'Enrolled Student'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-gray-900 block">{formatCurrency(inv.grand_total)}</span>
                    <span className="text-2xs text-gray-400">{inv.invoice_date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Course Program Fee Revenue Breakdown (1 Col) */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-navy-700" />
                Course Program Fee Breakdown
              </h3>
            </div>

            {summary.course_breakdown.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-8 text-center">
                No course breakdown data recorded for this period.
              </p>
            ) : (
              <div className="space-y-3 mt-4">
                {summary.course_breakdown.map((cb, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-gray-50/70 border border-gray-100 space-y-1.5 text-xs">
                    <div className="font-semibold text-gray-900 flex justify-between items-center">
                      <span>{cb.course_name}</span>
                      <span className="font-mono text-rose-700 font-bold">{formatCurrency(cb.outstanding_current)} due</span>
                    </div>
                    <div className="flex justify-between text-2xs text-gray-500">
                      <span>Billed: <strong className="text-gray-800 font-mono">{formatCurrency(cb.billed_for_period)}</strong></span>
                      <span>Collected: <strong className="text-emerald-700 font-mono">{formatCurrency(cb.collected_for_period)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Row 2: Faculty Payroll Disbursements (1 Col) & Recent Payment Receipts (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Faculty Payroll Disbursements Card (1 Col) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-navy-700" />
                Faculty Payroll Disbursements
              </h3>
              <Link href="/payslips" className="text-2xs font-semibold text-navy-700 hover:underline flex items-center gap-1">
                View Payslips <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <p className="text-xs text-gray-500 mt-3 leading-relaxed">
              Faculty salary disbursements, gross earnings, statutory deductions, and monthly net pay registers.
            </p>

            <div className="mt-4 p-5 rounded-xl bg-navy-900 text-white space-y-2 relative overflow-hidden shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-2xs font-bold uppercase tracking-wider text-sky-400">
                  Total Net Salary Disbursed (Current Month)
                </span>
                <span className="text-2xs font-mono bg-navy-800 text-sky-300 px-2 py-0.5 rounded border border-navy-700">
                  Current Month
                </span>
              </div>
              <div className="text-3xl font-black font-mono text-white">
                {formatCurrency(summary.current_month_payroll)}
              </div>
              <p className="text-2xs text-navy-200 pt-1">
                Authoritative sum of all finalized net salary payslips generated for current month.
              </p>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-2xs text-gray-500">
            <span>Faculty Payroll Register</span>
            <Link href="/reports" className="font-semibold text-navy-800 hover:underline">
              Audit Payroll Reports &rarr;
            </Link>
          </div>
        </div>

        {/* Recent Payment Receipts Feed (1 Col) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-700" />
              Recent Payment Receipts
            </h3>
            <Link href="/payments" className="text-2xs font-semibold text-emerald-700 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {summary.recent_payments.length === 0 ? (
            <p className="text-xs text-gray-400 italic py-4">No recent payment receipts found.</p>
          ) : (
            <div className="space-y-3">
              {summary.recent_payments.map((p) => (
                <div key={p.id} className="p-3 rounded-lg bg-emerald-50/40 border border-emerald-100 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-mono font-bold text-emerald-900 block">{p.receipt_no}</span>
                    <span className="text-2xs text-gray-500">{p.student_name || 'Enrolled Student'}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-emerald-700 block">{formatCurrency(p.amount)}</span>
                    <span className="text-2xs text-gray-400 font-mono">{p.payment_date}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
