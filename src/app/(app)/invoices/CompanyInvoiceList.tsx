'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { updateCompanyInvoiceStatus, deleteCompanyInvoice } from '@/lib/company-invoices/actions'
import { formatCurrencyWithSymbol, getCurrencySymbol } from '@/lib/utils/currency'
import { StatusBadge, type StatusType } from '@/components/ui/StatusBadge'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { Pagination } from '@/components/ui/Pagination'
import {
  Building2,
  Search,
  Plus,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Download,
  XCircle,
  CheckCircle2,
  FileSpreadsheet,
  Globe2,
  Loader2,
} from 'lucide-react'
import type { CompanyInvoice, CompanyInvoiceStatus, SupportedCurrency } from '@/types/database'

export function CompanyInvoiceList() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const [searchInput, setSearchInput] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(10)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')

  const [cancellingInvoice, setCancellingInvoice] = useState<CompanyInvoice | null>(null)
  const [deletingInvoice, setDeletingInvoice] = useState<CompanyInvoice | null>(null)

  // Debounce search query (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // Fetch paginated Company Invoices
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.companyInvoices.list({
      page,
      pageSize,
      search: debouncedSearch,
      status: statusFilter,
      currency: currencyFilter,
    }),
    queryFn: async () => {
      const from = page * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('company_invoices')
        .select(
          `
          *,
          company_invoice_items (
            id,
            description,
            quantity,
            unit_price,
            line_total,
            currency
          )
        `,
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })

      if (debouncedSearch) {
        query = query.or(
          `invoice_no.ilike.%${debouncedSearch}%,company_name.ilike.%${debouncedSearch}%,company_phone.ilike.%${debouncedSearch}%,company_gstin.ilike.%${debouncedSearch}%,company_cin.ilike.%${debouncedSearch}%`
        )
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      if (currencyFilter !== 'all') {
        query = query.eq('currency', currencyFilter)
      }

      const { data: rawInvoices, count, error } = await query.range(from, to)
      if (error) throw error

      return {
        invoices: (rawInvoices || []) as CompanyInvoice[],
        totalCount: count || 0,
      }
    },
    placeholderData: keepPreviousData,
  })

  // Independent summary metrics for Company Invoices
  const { data: metrics } = useQuery({
    queryKey: queryKeys.companyInvoices.summaryMetrics,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_invoices')
        .select('id, status, grand_total, currency')

      if (error) throw error
      const rows = data || []

      const totalCount = rows.length
      const draftCount = rows.filter((r) => r.status === 'draft').length
      const sentCount = rows.filter((r) => r.status === 'sent').length
      const paidCount = rows.filter((r) => r.status === 'paid').length
      const cancelledCount = rows.filter((r) => r.status === 'cancelled').length

      return { totalCount, draftCount, sentCount, paidCount, cancelledCount }
    },
  })

  // Status Change Mutation
  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CompanyInvoiceStatus }) => {
      await updateCompanyInvoiceStatus(id, status, supabase)
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvoices.all })
      success(`Company invoice status updated to ${vars.status}`)
      setCancellingInvoice(null)
    },
    onError: (err: Error) => {
      toastError('Failed to update status', err.message)
    },
  })

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteCompanyInvoice(id, supabase)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvoices.all })
      success('Company invoice deleted successfully')
      setDeletingInvoice(null)
    },
    onError: (err: Error) => {
      toastError('Failed to delete company invoice', err.message)
    },
  })

  const invoices = data?.invoices || []
  const totalCount = data?.totalCount || 0

  return (
    <div className="space-y-6">
      {/* Top Header - Exact Match with Student Invoices */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Company Invoices &amp; Billing
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Issue and track corporate B2B invoices with international currencies (INR, USD, NZD, PHP) and optional GST.
          </p>
        </div>

        <Link
          href="/invoices/new?type=company"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-navy-900 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Company Invoice
        </Link>
      </div>

      {/* Summary Overview Strip - Exact Match with Student Invoices */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
            Draft Invoices
          </span>
          <div className="text-2xl font-bold font-mono text-gray-900 mt-1">
            {metrics?.draftCount ?? 0}
          </div>
          <span className="text-2xs text-gray-400">Working drafts</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-2xs font-semibold text-amber-700 uppercase tracking-wider">
            Issued (Sent)
          </span>
          <div className="text-2xl font-bold font-mono text-amber-700 mt-1">
            {metrics?.sentCount ?? 0}
          </div>
          <span className="text-2xs text-gray-400">Awaiting company remittance</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-2xs font-semibold text-emerald-800 uppercase tracking-wider">
            Fully Settled (Paid)
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1">
            {metrics?.paidCount ?? 0}
          </div>
          <span className="text-2xs text-emerald-600">Zero balance remaining</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-2xs font-semibold text-rose-700 uppercase tracking-wider">
            Cancelled Invoices
          </span>
          <div className="text-2xl font-bold font-mono text-rose-700 mt-1">
            {metrics?.cancelledCount ?? 0}
          </div>
          <span className="text-2xs text-gray-400">Voided corporate records</span>
        </div>
      </div>

      {/* Filter and Search Bar - Exact Match with Student Invoices */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by invoice no, company name, phone, GSTIN, CIN..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Currency Filter */}
        <div className="w-full md:w-44">
          <select
            value={currencyFilter}
            onChange={(e) => {
              setCurrencyFilter(e.target.value)
              setPage(0)
            }}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent cursor-pointer bg-white"
          >
            <option value="all">All Currencies</option>
            <option value="INR">INR (₹)</option>
            <option value="USD">USD ($)</option>
            <option value="NZD">NZD (NZ$)</option>
            <option value="PHP">PHP (₱)</option>
          </select>
        </div>

        {/* Status Filter Badges */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-gray-500 flex items-center gap-1 pl-1 pr-1">
            <Filter className="w-3 h-3" /> Status:
          </span>
          {['all', 'draft', 'sent', 'paid', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st)
                setPage(0)
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                statusFilter === st
                  ? 'bg-navy-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table - Exact Match with Student Invoices (Borders, Headers, Padding, Styling) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-gray-400 mb-3" />
            <h3 className="text-base font-semibold text-gray-900">
              No Company Invoices Found
            </h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mt-1">
              {debouncedSearch || statusFilter !== 'all' || currencyFilter !== 'all'
                ? 'No company invoices match the active search criteria or status filter.'
                : 'No corporate invoices have been generated yet. Click above to create one.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50/75 border-b border-gray-200 text-2xs uppercase tracking-wider text-gray-500 font-semibold">
                <tr>
                  <th scope="col" className="px-6 py-3.5">Invoice Ref</th>
                  <th scope="col" className="px-6 py-3.5">Company / Contact</th>
                  <th scope="col" className="px-6 py-3.5">Tax / Identification</th>
                  <th scope="col" className="px-6 py-3.5">Due Date</th>
                  <th scope="col" className="px-6 py-3.5 text-center">Currency</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Grand Total</th>
                  <th scope="col" className="px-6 py-3.5 text-center">Status</th>
                  <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv) => {
                  const curr = inv.currency || 'INR'
                  const currSym = getCurrencySymbol(curr)

                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-gray-50/60 transition-colors"
                    >
                      {/* Invoice Ref */}
                      <td className="px-6 py-4 font-mono font-bold text-navy-800">
                        <Link
                          href={`/invoices/company/${inv.id}`}
                          className="hover:underline hover:text-accent flex items-center gap-1.5"
                        >
                          <Building2 className="w-3.5 h-3.5 text-navy-700 shrink-0" />
                          <span>{inv.invoice_no}</span>
                        </Link>
                      </td>

                      {/* Company & Phone */}
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">
                          {inv.company_name}
                        </div>
                        <div className="text-2xs text-gray-400">
                          {inv.company_phone}
                          {inv.company_address && ` • ${inv.company_address.slice(0, 32)}...`}
                        </div>
                      </td>

                      {/* Tax IDs */}
                      <td className="px-6 py-4 text-xs font-mono space-y-0.5">
                        {inv.company_gstin && (
                          <div className="text-gray-700">
                            <span className="text-2xs font-bold text-gray-400 uppercase mr-1">GST:</span>
                            {inv.company_gstin}
                          </div>
                        )}
                        {inv.company_cin && (
                          <div className="text-gray-700">
                            <span className="text-2xs font-bold text-gray-400 uppercase mr-1">CIN:</span>
                            {inv.company_cin}
                          </div>
                        )}
                        {!inv.company_gstin && !inv.company_cin && (
                          <span className="text-gray-400 text-xs italic">N/A</span>
                        )}
                      </td>

                      {/* Due Date */}
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {new Date(inv.due_date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      {/* Currency Badge */}
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
                          <Globe2 className="w-3 h-3 text-gray-500" />
                          {curr} ({currSym})
                        </span>
                      </td>

                      {/* Grand Total */}
                      <td className="px-6 py-4 text-right font-mono font-bold text-gray-900">
                        <div>
                          <span>{formatCurrencyWithSymbol(inv.grand_total, curr)}</span>
                          {Number(inv.converted_grand_total) > 0 && inv.converted_currency && (
                            <span className="block text-2xs font-normal text-emerald-700">
                              ≈ {formatCurrencyWithSymbol(Number(inv.converted_grand_total) || 0, inv.converted_currency)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="px-6 py-4 text-center">
                        <StatusBadge status={inv.status as StatusType} />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/invoices/company/${inv.id}`}
                            className="p-1 text-gray-400 hover:text-navy-700 rounded-md transition-colors"
                            title="View Invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>

                          <a
                            href={`/api/company-invoices/${inv.id}/pdf`}
                            download
                            className="p-1 text-gray-400 hover:text-emerald-700 rounded-md transition-colors"
                            title="Download PDF"
                          >
                            <Download className="w-4 h-4" />
                          </a>

                          {inv.status !== 'cancelled' && (
                            <Link
                              href={`/invoices/company/${inv.id}/edit`}
                              className="p-1 text-gray-400 hover:text-navy-700 rounded-md transition-colors"
                              title="Edit Invoice"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Link>
                          )}

                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => statusMutation.mutate({ id: inv.id, status: 'paid' })}
                              className="p-1 text-gray-400 hover:text-emerald-700 rounded-md transition-colors cursor-pointer"
                              title="Mark as Paid"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}

                          {inv.status !== 'cancelled' && (
                            <button
                              type="button"
                              onClick={() => setCancellingInvoice(inv)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                              title="Cancel Invoice"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {inv.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() => setDeletingInvoice(inv)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                              title="Delete Draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination - Exact Match with Student Invoices */}
        <Pagination
          totalCount={totalCount}
          currentPage={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          itemLabel="Company Invoices"
          isLoading={isLoading}
        />
      </div>

      {/* Cancel Confirmation Modal - Exact Match with Student Invoices */}
      {cancellingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Cancel Company Invoice</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to cancel company invoice{' '}
              <span className="font-mono font-bold text-navy-900">
                {cancellingInvoice.invoice_no}
              </span>{' '}
              for <span className="font-semibold text-gray-900">{cancellingInvoice.company_name}</span>?
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCancellingInvoice(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              >
                No, Keep Active
              </button>
              <button
                type="button"
                disabled={statusMutation.isPending}
                onClick={() =>
                  statusMutation.mutate({
                    id: cancellingInvoice.id,
                    status: 'cancelled',
                  })
                }
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {statusMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Yes, Cancel Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Delete Draft Company Invoice</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to permanently delete draft invoice{' '}
              <span className="font-mono font-bold text-navy-900">
                {deletingInvoice.invoice_no}
              </span>{' '}
              for <span className="font-semibold text-gray-900">{deletingInvoice.company_name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeletingInvoice(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deletingInvoice.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
