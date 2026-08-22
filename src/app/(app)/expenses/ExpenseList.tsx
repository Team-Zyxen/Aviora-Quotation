'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/query-keys'
import { formatCurrency } from '@/lib/utils/currency'
import { useToast } from '@/components/ui/Toast'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'
import {
  CreditCard,
  Plus,
  Download,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Tag,
} from 'lucide-react'

// Preset Categories
const PRESET_CATEGORIES = [
  'Rent',
  'Utilities',
  'Subscriptions & Software',
  'Staff Salaries',
  'Maintenance',
  'Marketing',
  'Professional Services',
  'Miscellaneous',
]

// Payment Modes matching DB check constraint exactly
const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

function formatPaymentMode(mode: string): string {
  const found = PAYMENT_MODES.find((m) => m.value === mode)
  return found ? found.label : mode
}

export function ExpenseList() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  // Search & Filter State
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [paymentModeFilter, setPaymentModeFilter] = useState('all')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // Debounce search input (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [startDate, endDate, categoryFilter, paymentModeFilter])

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)
  const [deleteExpense, setDeleteExpense] = useState<any | null>(null)
  const [notesViewExpense, setNotesViewExpense] = useState<any | null>(null)

  // Form Fields State
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [payeeName, setPayeeName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('Rent')
  const [customCategory, setCustomCategory] = useState('')
  const [paymentMode, setPaymentMode] = useState('bank_transfer')
  const [amount, setAmount] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  // Fetch distinct categories for filter dropdown
  const { data: distinctCategories = [] } = useQuery({
    queryKey: ['distinct-expense-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_expenses')
        .select('category')

      if (error) return []
      const cats = Array.from(new Set((data || []).map((d) => d.category).filter(Boolean)))
      return cats.sort()
    },
  })

  // Fetch paginated expenses list
  const { data: expensesData, isLoading, isError, error: queryErr } = useQuery({
    queryKey: queryKeys.expenses.list({
      search: debouncedSearch,
      startDate,
      endDate,
      categoryFilter,
      paymentModeFilter,
      page,
      pageSize,
    }),
    queryFn: async () => {
      let query = supabase
        .from('operational_expenses')
        .select('*', { count: 'exact' })

      if (debouncedSearch.trim()) {
        const term = debouncedSearch.trim()
        query = query.or(`payee_name.ilike.%${term}%,category.ilike.%${term}%`)
      }

      if (startDate) {
        query = query.gte('expense_date', startDate)
      }
      if (endDate) {
        query = query.lte('expense_date', endDate)
      }
      if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter)
      }
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        query = query.eq('payment_mode', paymentModeFilter)
      }

      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      const { data, count, error } = await query
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to)

      if (error) throw error

      return {
        expenses: data || [],
        totalCount: count || 0,
      }
    },
  })

  const expensesList = expensesData?.expenses || []
  const totalCount = expensesData?.totalCount || 0
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  // Open Form Modal for Create / Edit
  const openFormModal = (exp?: any) => {
    setFormError(null)
    if (exp) {
      setEditingExpense(exp)
      setFormDate(exp.expense_date || new Date().toISOString().split('T')[0])
      setPayeeName(exp.payee_name || '')

      if (PRESET_CATEGORIES.includes(exp.category)) {
        setSelectedCategory(exp.category)
        setCustomCategory('')
      } else {
        setSelectedCategory('Other')
        setCustomCategory(exp.category || '')
      }

      setPaymentMode(exp.payment_mode || 'bank_transfer')
      setAmount(String(exp.amount || ''))
      setNotes(exp.notes || '')
    } else {
      setEditingExpense(null)
      setFormDate(new Date().toISOString().split('T')[0])
      setPayeeName('')
      setSelectedCategory('Rent')
      setCustomCategory('')
      setPaymentMode('bank_transfer')
      setAmount('')
      setNotes('')
    }
    setIsFormOpen(true)
  }

  // Mutation: Save (Create / Edit) Expense
  const saveExpenseMutation = useMutation({
    mutationFn: async () => {
      setFormError(null)

      if (!payeeName.trim()) {
        throw new Error('Payee name is required')
      }

      const finalCategory =
        selectedCategory === 'Other' ? customCategory.trim() : selectedCategory.trim()

      if (!finalCategory) {
        throw new Error('Please specify a valid expense category')
      }

      const parsedAmount = parseInt(amount, 10)
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new Error('Amount must be a positive whole rupee amount')
      }

      const payload: any = {
        expense_date: formDate,
        payee_name: payeeName.trim(),
        category: finalCategory,
        payment_mode: paymentMode,
        amount: parsedAmount,
        notes: notes.trim() || null,
      }

      if (editingExpense?.id) {
        const { data, error } = await supabase
          .from('operational_expenses')
          .update(payload)
          .eq('id', editingExpense.id)
          .select()
          .single()

        if (error) throw error
        return data
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) payload.created_by = user.id

        const { data, error } = await supabase
          .from('operational_expenses')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        return data
      }
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toastError('Save failed', err.message)
    },
    onSuccess: (data) => {
      // 1. Close modal and show notification IMMEDIATELY
      setIsFormOpen(false)
      success(
        editingExpense ? 'Expense Updated' : 'Expense Recorded',
        `Recorded ₹${data.amount} for ${data.payee_name}`
      )

      // 2. Direct cache update for instant UI feedback
      queryClient.setQueriesData(
        { queryKey: ['expenses-list'] },
        (oldData: any) => {
          if (!oldData || !oldData.expenses) return oldData
          if (editingExpense) {
            return {
              ...oldData,
              expenses: oldData.expenses.map((exp: any) =>
                exp.id === data.id ? data : exp
              ),
            }
          } else {
            return {
              ...oldData,
              expenses: [data, ...oldData.expenses],
              totalCount: (oldData.totalCount || 0) + 1,
            }
          }
        }
      )

      // 3. Background invalidation for dashboard summary and list reconciliation
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.summary })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all,
        refetchType: 'none',
      })
      queryClient.invalidateQueries({ queryKey: ['distinct-expense-categories'] })
    },
  })

  // Mutation: Delete Expense
  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('operational_expenses')
        .delete()
        .eq('id', id)

      if (error) throw error
      return id
    },
    onError: (err: Error) => {
      toastError('Delete failed', err.message)
    },
    onSuccess: (_, deletedId) => {
      // 1. Close modal and show notification IMMEDIATELY
      setDeleteExpense(null)
      success('Expense Deleted', 'The expense entry was removed')

      // 2. Direct cache update for instant UI feedback
      queryClient.setQueriesData(
        { queryKey: ['expenses-list'] },
        (oldData: any) => {
          if (!oldData || !oldData.expenses) return oldData
          return {
            ...oldData,
            expenses: oldData.expenses.filter((exp: any) => exp.id !== deletedId),
            totalCount: Math.max(0, (oldData.totalCount || 1) - 1),
          }
        }
      )

      // 3. Background invalidation for dashboard summary and list reconciliation
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.summary })
      queryClient.invalidateQueries({
        queryKey: queryKeys.expenses.all,
        refetchType: 'none',
      })
    },
  })

  // Export filtered records to Excel (.xlsx) client-side
  const handleExportExcel = () => {
    if (expensesList.length === 0) {
      toastError('Export Failed', 'No expense records available to export')
      return
    }

    const exportData = expensesList.map((exp: any) => ({
      'Date': exp.expense_date,
      'Payee Name': exp.payee_name,
      'Category': exp.category,
      'Payment Mode': formatPaymentMode(exp.payment_mode),
      'Amount (₹)': Number(exp.amount),
      'Notes': exp.notes || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Operational Expenses')
    XLSX.writeFile(
      workbook,
      `Operational_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`
    )
    success('Export Complete', 'Excel file generated successfully')
  }

  return (
    <div className="w-full max-w-full min-w-0 space-y-6 pb-12 box-border">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 w-full min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-navy-700 shrink-0" />
            <span className="truncate">Operational Expenses Ledger</span>
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Track vendor payments, facility overheads, monthly operational expenditures, and export records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            Export to Excel
          </button>

          <button
            onClick={() => openFormModal()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Expense
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs space-y-3 w-full min-w-0">
        <div className="flex flex-col md:flex-row md:items-center gap-3 w-full min-w-0">
          {/* Search Field (flexible width) */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search payee or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          {/* Filter Dropdowns & Date Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Category Filter */}
            <div className="w-full sm:w-auto min-w-[140px]">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
              >
                <option value="all">All Categories</option>
                {Array.from(
                  new Set([...PRESET_CATEGORIES, ...distinctCategories])
                ).map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Mode Filter */}
            <div className="w-full sm:w-auto min-w-[140px]">
              <select
                value={paymentModeFilter}
                onChange={(e) => setPaymentModeFilter(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
              >
                <option value="all">All Payment Modes</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="flex items-center gap-1.5 w-full sm:w-auto">
              <input
                type="date"
                title="Start Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-32 rounded-lg border border-gray-300 px-2 py-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
              />
              <span className="text-gray-400 text-xs shrink-0">-</span>
              <input
                type="date"
                title="End Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-32 rounded-lg border border-gray-300 px-2 py-2 text-xs shadow-xs focus:ring-accent focus:border-accent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Expenses Table Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden w-full min-w-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : isError ? (
          <div className="p-6">
            <ErrorBanner error={(queryErr as Error)?.message || 'Failed to load expenses'} />
          </div>
        ) : expensesList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
              <CreditCard className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-gray-900">No Operational Expenses Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              No expense records match your current search filters or date range. Click "Add Expense" to record a new payment.
            </p>
          </div>
        ) : (
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider text-2xs border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3">Expense Date</th>
                  <th className="px-6 py-3">Payee Name</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Payment Mode</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                  <th className="px-6 py-3">Notes</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {expensesList.map((exp: any) => {
                  const hasLongNotes = exp.notes && exp.notes.length > 40
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                        {exp.expense_date
                          ? new Date(exp.expense_date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">{exp.payee_name}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200 whitespace-nowrap">
                          <Tag className="w-3 h-3 text-gray-500" />
                          {exp.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-navy-50 text-navy-800 border border-navy-100 font-mono whitespace-nowrap">
                          {formatPaymentMode(exp.payment_mode)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-gray-900 whitespace-nowrap">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="px-6 py-4 text-gray-600 max-w-xs">
                        {exp.notes ? (
                          <div className="flex items-center gap-1">
                            <span className="truncate">
                              {hasLongNotes ? `${exp.notes.substring(0, 40)}...` : exp.notes}
                            </span>
                            {hasLongNotes && (
                              <button
                                onClick={() => setNotesViewExpense(exp)}
                                className="text-2xs font-semibold text-accent hover:underline shrink-0 cursor-pointer"
                              >
                                Read
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 italic">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openFormModal(exp)}
                            title="Edit Expense"
                            className="p-1.5 text-gray-500 hover:text-navy-800 hover:bg-navy-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteExpense(exp)}
                            title="Delete Expense"
                            className="p-1.5 text-gray-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <Pagination
          totalCount={totalCount}
          currentPage={page - 1}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p + 1)}
          itemLabel="Expenses"
          isLoading={isLoading}
        />
      </div>

      {/* Modal: Add / Edit Expense */}
      {isFormOpen && (
        <Modal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          title={editingExpense ? 'Edit Operational Expense' : 'Record Operational Expense'}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              saveExpenseMutation.mutate()
            }}
            className="space-y-4 pt-2"
          >
            {formError && <ErrorBanner title="Save Failed" error={formError} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Expense Date *
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payee / Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Skyline Properties / FiberNet"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Expense Category *
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                >
                  {PRESET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  <option value="Other">Other (Custom Category)</option>
                </select>
              </div>

              {selectedCategory === 'Other' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Custom Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter category name"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Amount (₹ Whole Rupees) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">
                  ₹
                </span>
                <input
                  type="number"
                  required
                  min={1}
                  step={1}
                  placeholder="Enter expense amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 pl-8 pr-3 py-2 text-sm font-mono font-bold text-gray-900 shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Notes / Reference Remarks (Optional)
              </label>
              <textarea
                rows={3}
                placeholder="Invoice reference, transaction ref ID, or remarks..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveExpenseMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {saveExpenseMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {editingExpense ? 'Update Expense' : 'Save Expense Record'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Delete Confirmation */}
      {deleteExpense && (
        <Modal
          isOpen={!!deleteExpense}
          onClose={() => setDeleteExpense(null)}
          title="Confirm Delete Expense"
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs text-rose-900 space-y-1">
                <strong className="font-bold block">Delete Expense Entry</strong>
                <p>
                  Are you sure you want to delete the expense entry for{' '}
                  <strong className="font-bold text-rose-950">{deleteExpense.payee_name}</strong> (₹
                  {deleteExpense.amount})?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setDeleteExpense(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteExpenseMutation.isPending}
                onClick={() => deleteExpenseMutation.mutate(deleteExpense.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleteExpenseMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Delete Record
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: View Full Notes */}
      {notesViewExpense && (
        <Modal
          isOpen={!!notesViewExpense}
          onClose={() => setNotesViewExpense(null)}
          title={`Expense Remarks: ${notesViewExpense.payee_name}`}
        >
          <div className="space-y-4 pt-2">
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 whitespace-pre-wrap font-sans">
              {notesViewExpense.notes}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setNotesViewExpense(null)}
                className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
