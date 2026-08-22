'use client'

import React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { getStudentLedger } from '@/lib/rpc/reads'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { StatusBadge, type StatusType } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  Receipt,
  FileSpreadsheet,
  Plus,
  CreditCard,
  Download,
  Eye,
  CheckCircle2,
  Calendar,
  Layers,
  AlertCircle,
  FileText,
} from 'lucide-react'

interface StudentFeeLedgerSectionProps {
  studentId: string
}

export function StudentFeeLedgerSection({ studentId }: StudentFeeLedgerSectionProps) {
  // Authoritative Single Read RPC Query for Student Ledger Statement
  const { data: ledger, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.studentLedger(studentId),
    queryFn: () => getStudentLedger(studentId),
  })

  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <Skeleton className="h-6 w-1/4" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    )
  }

  if (isError || !ledger) {
    return (
      <div className="bg-white p-8 text-center rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="mx-auto w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
          <AlertCircle className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-gray-900">Failed to load student fee ledger</h4>
        <p className="text-xs text-gray-500">
          {(error as Error)?.message || 'An error occurred while loading student fee ledger.'}
        </p>
      </div>
    )
  }

  const invoices = ledger.invoices || []
  const payments = ledger.payments || []
  const draftInvoices = ledger.draft_invoices || []

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden space-y-6 p-6">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Receipt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Student Fee Ledger & Billing Statement</h3>
            <span className="text-2xs text-gray-400">
              Authoritative real-time student billing statement
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/invoices/new`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Issue Invoice
          </Link>

          <Link
            href={`/payments/new`}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition-colors"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Record Payment
          </Link>
        </div>
      </div>

      {/* Authoritative Ledger Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
          <span className="text-2xs font-semibold uppercase tracking-wider text-gray-500">
            Total Lifetime Billed
          </span>
          <div className="text-xl font-bold font-mono text-gray-900 mt-1">
            {formatCurrency(ledger.total_billed)}
          </div>
          <span className="text-2xs text-gray-400">
            {invoices.length} {invoices.length === 1 ? 'Tax Invoice' : 'Tax Invoices'} Issued
          </span>
        </div>

        <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
          <span className="text-2xs font-semibold uppercase tracking-wider text-emerald-800">
            Total Collections Paid
          </span>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
            {formatCurrency(ledger.total_paid)}
          </div>
          <span className="text-2xs text-emerald-600">
            {payments.length} {payments.length === 1 ? 'Receipt' : 'Receipts'} Issued
          </span>
        </div>

        <div
          className={`p-4 rounded-xl border ${
            ledger.total_outstanding > 0
              ? 'bg-rose-50/70 border-rose-200 text-rose-900'
              : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
          }`}
        >
          <span className="text-2xs font-semibold uppercase tracking-wider text-gray-600">
            Current Outstanding Balance
          </span>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              ledger.total_outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatCurrency(ledger.total_outstanding)}
          </div>
          <span className="text-2xs text-gray-500">
            {ledger.total_outstanding === 0
              ? '✓ All invoices fully settled'
              : 'Unpaid balance across active invoices'}
          </span>
        </div>
      </div>

      {/* Sub-Section 1: Active Tax Invoices Table */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
          <FileSpreadsheet className="w-4 h-4 text-navy-700" />
          Active Tax Invoices ({invoices.length})
        </h4>

        {invoices.length === 0 ? (
          <div className="p-6 text-center bg-gray-50/60 rounded-xl border border-dashed border-gray-200 text-xs text-gray-500">
            No tax invoices have been issued for this student yet.
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Invoice Ref</th>
                  <th scope="col" className="px-4 py-2.5">Invoice Date</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Grand Total</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Paid</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Balance Due</th>
                  <th scope="col" className="px-4 py-2.5 text-center">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-navy-800">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="hover:underline hover:text-accent"
                      >
                        {inv.invoice_no}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {new Date(inv.invoice_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-900">
                      {formatCurrency(inv.grand_total)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                      {formatCurrency(inv.amount_paid)}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={inv.balance_due > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                        {formatCurrency(inv.balance_due)}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={inv.computed_status as StatusType} />
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="p-1 text-gray-400 hover:text-navy-700"
                          title="View Invoice"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Link>

                        <a
                          href={`/api/invoices/${inv.id}/pdf`}
                          download
                          className="p-1 text-gray-400 hover:text-emerald-700"
                          title="Download PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        {inv.balance_due > 0 && inv.computed_status !== 'cancelled' && (
                          <Link
                            href={`/payments/new?invoice_id=${inv.id}`}
                            className="px-2 py-0.5 text-2xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors"
                          >
                            Pay
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sub-Section 2: Payment Receipts History Table */}
      <div className="space-y-3 pt-4 border-t border-gray-100">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700 flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-emerald-700" />
          Receipts &amp; Payment Collections ({payments.length})
        </h4>
        <p className="text-xs text-gray-500 mt-0.5">
          Student fee payments, bank transactions, and generated receipts
        </p>

        {payments.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-4">
            No payments have been received for this student yet.
          </p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Receipt No</th>
                  <th scope="col" className="px-4 py-2.5">Payment Date</th>
                  <th scope="col" className="px-4 py-2.5">Invoice Ref</th>
                  <th scope="col" className="px-4 py-2.5">Payment Mode</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Amount Paid</th>
                  <th scope="col" className="px-4 py-2.5 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-navy-800">{p.receipt_no}</td>

                    <td className="px-4 py-3 text-gray-600">
                      {new Date(p.payment_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-4 py-3 font-mono text-2xs text-navy-700">
                      <span className="font-semibold">{p.invoice_no || '—'}</span>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-semibold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {p.payment_mode ? p.payment_mode.replace('_', ' ') : 'BANK'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                      {formatCurrency(p.amount)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/payments/${p.id}/pdf`}
                        download
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-2xs font-semibold text-navy-800 bg-navy-50 hover:bg-navy-100 rounded-md transition-colors"
                        title="Download Receipt PDF"
                      >
                        <Download className="w-3 h-3" />
                        Receipt
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sub-Section 3: Draft Invoices (Not Yet Billed - Excluded from Totals) */}
      {draftInvoices.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-dashed border-amber-300 bg-amber-50/40 p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-700" />
              Draft Invoices (Not Yet Billed — Excluded from Totals) ({draftInvoices.length})
            </h4>
            <span className="text-2xs text-amber-800 font-semibold bg-amber-100 px-2 py-0.5 rounded">
              Draft Mode
            </span>
          </div>

          <div className="overflow-x-auto border border-amber-200 rounded-lg bg-white">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-50/80 text-amber-900 font-semibold border-b border-amber-200">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Draft Ref</th>
                  <th scope="col" className="px-4 py-2.5">Draft Date</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Estimated Amount</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {draftInvoices.map((d) => (
                  <tr key={d.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-navy-800">
                      <Link href={`/invoices/${d.id}`} className="hover:underline hover:text-accent">
                        {d.invoice_no}
                      </Link>
                    </td>

                    <td className="px-4 py-3 text-gray-600">
                      {new Date(d.invoice_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="px-4 py-3 text-right font-mono font-bold text-gray-700">
                      {formatCurrency(d.grand_total)}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${d.id}`}
                        className="px-2.5 py-1 text-2xs font-semibold text-navy-900 bg-amber-100 hover:bg-amber-200 rounded transition-colors"
                      >
                        Issue Invoice
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
