'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  createCompanyInvoice,
  updateCompanyInvoice,
  type CreateCompanyInvoiceItemInput,
} from '@/lib/company-invoices/actions'
import { queryKeys } from '@/lib/query-keys'
import {
  CURRENCY_CONFIG,
  formatCurrencyWithSymbol,
  getCurrencySymbol,
  roundCurrency,
  type SupportedCurrency,
} from '@/lib/utils/currency'
import {
  getExchangeRate,
  formatExchangeRateDisplay,
  getDefaultConvertedCurrency,
} from '@/lib/utils/exchange-rates'
import { useToast } from '@/components/ui/Toast'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import {
  CompanyDetailsPanel,
  CompanyDetailsChangePayload,
  saveCompanySettings,
} from '@/components/shared/CompanyDetailsPanel'
import {
  Building2,
  Phone,
  MapPin,
  FileText,
  Hash,
  Calendar,
  Plus,
  Trash2,
  DollarSign,
  Layers,
  ArrowLeft,
  Loader2,
  Percent,
  CheckCircle2,
  Globe2,
  Receipt,
  Info,
  Sparkles,
  RefreshCw,
  ArrowRightLeft,
} from 'lucide-react'
import type { CompanyInvoice, CompanyInvoiceStatus } from '@/types/database'

function getInitialInvoiceDates() {
  const d = new Date()
  const today = d.toISOString().split('T')[0]
  const due = new Date(d.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  return { today, due }
}

const DEFAULT_INVOICE_DATES = getInitialInvoiceDates()
const CURRENCIES: SupportedCurrency[] = ['INR', 'USD', 'NZD', 'PHP']

interface CompanyInvoiceFormProps {
  initialInvoice?: CompanyInvoice | null
}

export function CompanyInvoiceForm({ initialInvoice }: CompanyInvoiceFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { success, error: toastError } = useToast()

  const isEditing = !!initialInvoice
  const [formError, setFormError] = useState<string | null>(null)

  // Company Details
  const [companyName, setCompanyName] = useState(initialInvoice?.company_name || '')
  const [companyPhone, setCompanyPhone] = useState(initialInvoice?.company_phone || '')
  const [companyAddress, setCompanyAddress] = useState(initialInvoice?.company_address || '')
  const [companyGstin, setCompanyGstin] = useState(initialInvoice?.company_gstin || '')
  const [companyCin, setCompanyCin] = useState(initialInvoice?.company_cin || '')

  // Invoice Dates & Meta
  const [invoiceDate, setInvoiceDate] = useState(
    initialInvoice?.invoice_date || DEFAULT_INVOICE_DATES.today
  )
  const [dueDate, setDueDate] = useState(
    initialInvoice?.due_date || DEFAULT_INVOICE_DATES.due
  )
  const [manualInvoiceNo, setManualInvoiceNo] = useState('')

  // Dual Currency & Exchange Rate State
  const [currency, setCurrency] = useState<SupportedCurrency>(
    initialInvoice?.currency || 'USD'
  )
  const [convertedCurrency, setConvertedCurrency] = useState<SupportedCurrency>(
    initialInvoice?.converted_currency ||
      (initialInvoice?.currency === 'INR' ? 'USD' : 'INR')
  )
  const [exchangeRate, setExchangeRate] = useState<number>(
    initialInvoice?.exchange_rate ? Number(initialInvoice.exchange_rate) : 1
  )
  const [exchangeRateDate, setExchangeRateDate] = useState<string>(
    initialInvoice?.exchange_rate_date ||
      initialInvoice?.invoice_date ||
      DEFAULT_INVOICE_DATES.today
  )
  const [isFetchingRate, setIsFetchingRate] = useState<boolean>(false)
  const [isCustomRate, setIsCustomRate] = useState<boolean>(false)
  const [rateSource, setRateSource] = useState<string>(
    initialInvoice?.exchange_rate ? 'saved' : 'live'
  )

  // Line items (Student Name / Description, Fee / Amount)
  const [items, setItems] = useState<CreateCompanyInvoiceItemInput[]>(
    initialInvoice?.company_invoice_items && initialInvoice.company_invoice_items.length > 0
      ? initialInvoice.company_invoice_items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          converted_unit_price: Number(it.converted_unit_price) || 0,
        }))
      : [
          {
            description: '',
            quantity: 1,
            unit_price: 0,
          },
        ]
  )

  // Adjustments & GST (GST is Optional)
  const [discountAmount, setDiscountAmount] = useState<number>(
    Number(initialInvoice?.discount_amount) || 0
  )
  const [applyGst, setApplyGst] = useState<boolean>(
    initialInvoice ? Number(initialInvoice.gst_percent) > 0 : false
  )
  const [gstPercent, setGstPercent] = useState<number>(
    initialInvoice && Number(initialInvoice.gst_percent) > 0
      ? Number(initialInvoice.gst_percent)
      : 18
  )
  const [notes, setNotes] = useState(
    initialInvoice?.notes ||
      '1. Payment must reference this company invoice number.\n2. Invoices overdue beyond 15 days may incur finance service fees.\n3. Bank account remittance details provided below.'
  )

  const [companyDetails, setCompanyDetails] = useState<CompanyDetailsChangePayload | null>(null)

  // Fetch exchange rate from API/helper for the given date
  const fetchRate = async (
    from: SupportedCurrency,
    to: SupportedCurrency,
    date: string,
    markCustom = false
  ) => {
    if (from === to) {
      setExchangeRate(1)
      setExchangeRateDate(date)
      setIsCustomRate(false)
      return
    }

    setIsFetchingRate(true)
    try {
      const res = await getExchangeRate(from, to, date)
      setExchangeRate(res.rate)
      setExchangeRateDate(res.date || date)
      setRateSource(res.source)
      if (!markCustom) setIsCustomRate(false)
    } catch (err: any) {
      console.error('Exchange rate fetch error:', err)
      toastError('Forex Rate Notice', 'Could not sync live rate. You can enter the rate manually.')
    } finally {
      setIsFetchingRate(false)
    }
  }

  // Initial fetch if new invoice
  useEffect(() => {
    if (!initialInvoice) {
      fetchRate(currency, convertedCurrency, invoiceDate)
    }
  }, [])

  // Currency change handler
  const handleCurrencyChange = (newCurrency: SupportedCurrency) => {
    setCurrency(newCurrency)
    let newConverted: SupportedCurrency
    if (newCurrency === 'INR') {
      newConverted = convertedCurrency === 'INR' ? 'USD' : convertedCurrency
    } else {
      newConverted = 'INR'
    }
    setConvertedCurrency(newConverted)
    fetchRate(newCurrency, newConverted, invoiceDate)
  }

  // Converted currency change handler (when primary is INR)
  const handleConvertedCurrencyChange = (newConverted: SupportedCurrency) => {
    setConvertedCurrency(newConverted)
    fetchRate(currency, newConverted, invoiceDate)
  }

  // Invoice date change handler (auto re-fetches rate for that particular day unless custom)
  const handleInvoiceDateChange = (newDate: string) => {
    setInvoiceDate(newDate)
    if (!isCustomRate) {
      fetchRate(currency, convertedCurrency, newDate)
    }
  }

  // Real-time primary calculations
  const subtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0
    const price = Number(item.unit_price) || 0
    return sum + qty * price
  }, 0)

  const sanitizedDiscount = Math.min(subtotal, Math.max(0, Number(discountAmount) || 0))
  const taxableAmount = Math.max(0, subtotal - sanitizedDiscount)
  const calculatedGst = applyGst ? (taxableAmount * (Number(gstPercent) || 0)) / 100 : 0
  const grandTotal = taxableAmount + calculatedGst

  // Real-time converted secondary calculations
  const convertedSubtotal = roundCurrency(subtotal * exchangeRate)
  const convertedDiscount = roundCurrency(sanitizedDiscount * exchangeRate)
  const convertedTaxable = roundCurrency(taxableAmount * exchangeRate)
  const convertedGst = roundCurrency(calculatedGst * exchangeRate)
  const convertedGrandTotal = roundCurrency(grandTotal * exchangeRate)

  const currentCurrencySymbol = getCurrencySymbol(currency)
  const convertedCurrencySymbol = getCurrencySymbol(convertedCurrency)
  const exchangeRateDisplay = formatExchangeRateDisplay(currency, convertedCurrency, exchangeRate)

  // Line Item Handlers
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

  const handleUpdateItem = (
    index: number,
    field: keyof CreateCompanyInvoiceItemInput,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        return {
          ...item,
          [field]: field === 'description' ? value : Number(value) || 0,
        }
      })
    )
  }

  // When user edits the converted equivalent price directly
  const handleUpdateItemSecondary = (index: number, convertedPrice: number) => {
    const primaryPrice = exchangeRate > 0 ? roundCurrency(convertedPrice / exchangeRate) : 0
    handleUpdateItem(index, 'unit_price', primaryPrice)
  }

  // Mutation to Create or Update
  const saveMutation = useMutation({
    mutationFn: async (saveAsDraft: boolean) => {
      setFormError(null)

      if (!companyName.trim()) {
        throw new Error('Please enter the recipient Company Name')
      }
      if (!companyPhone.trim()) {
        throw new Error('Please enter the company Mobile / Phone Number')
      }
      if (!dueDate) {
        throw new Error('Please enter the payment due date')
      }
      if (items.length === 0 || items.some((it) => !it.description.trim())) {
        throw new Error('Please provide a valid Student Name / Description for all fee items')
      }
      if (items.some((it) => (Number(it.quantity) || 0) <= 0)) {
        throw new Error('All item quantities must be greater than zero')
      }
      if (items.some((it) => (Number(it.unit_price) || 0) < 0)) {
        throw new Error('Item Fee / Amount cannot be negative')
      }

      // Save updated company & document settings if modified by user
      if (companyDetails?.isDirty) {
        try {
          await saveCompanySettings(supabase, companyDetails.values)
        } catch (csErr: any) {
          console.warn('Company settings update warning:', csErr?.message || csErr)
          toastError(
            'Settings Save Notice',
            'Invoice will be generated, but company default settings could not be updated.'
          )
        }
      }

      if (isEditing && initialInvoice) {
        return await updateCompanyInvoice(
          {
            id: initialInvoice.id,
            companyName,
            companyPhone,
            companyAddress,
            companyGstin,
            companyCin,
            currency,
            convertedCurrency,
            exchangeRate,
            exchangeRateDate,
            invoiceDate,
            dueDate,
            items,
            discountAmount: sanitizedDiscount,
            applyGst,
            gstPercent: applyGst ? Number(gstPercent) || 18 : 0,
            notes,
            saveAsDraft,
            manualInvoiceNo: manualInvoiceNo.trim() || null,
          },
          supabase
        )
      } else {
        return await createCompanyInvoice(
          {
            companyName,
            companyPhone,
            companyAddress,
            companyGstin,
            companyCin,
            currency,
            convertedCurrency,
            exchangeRate,
            exchangeRateDate,
            invoiceDate,
            dueDate,
            items,
            discountAmount: sanitizedDiscount,
            applyGst,
            gstPercent: applyGst ? Number(gstPercent) || 18 : 0,
            notes,
            saveAsDraft,
            manualInvoiceNo: manualInvoiceNo.trim() || null,
          },
          supabase
        )
      }
    },
    onError: (err: Error) => {
      setFormError(err.message)
      toastError(
        isEditing ? 'Invoice Update Failed' : 'Company Invoice Creation Failed',
        err.message
      )
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.companyInvoices.detail(result.invoice_id) })
      success(
        isEditing ? 'Company Invoice Updated' : 'Company Invoice Created',
        `Invoice ${result.invoice_no} has been successfully ${
          result.status === 'draft' ? 'saved as draft' : 'issued'
        }.`
      )
      router.push(`/invoices/company/${result.invoice_id}`)
    },
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/invoices"
            className="p-2 text-gray-400 hover:text-navy-700 hover:bg-white rounded-lg border border-gray-200 shadow-xs transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Corporate Invoicing
            </span>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              {isEditing ? `Edit Company Invoice (${initialInvoice?.invoice_no})` : 'New Company Invoice'}
            </h1>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Dual Currency Enabled ({currency} &amp; {convertedCurrency})
        </span>
      </div>

      {formError && <ErrorBanner error={formError} onDismiss={() => setFormError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Form (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Recipient Company & Invoicing Details */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 pb-3 border-b border-gray-100">
              <Building2 className="w-4 h-4 text-navy-700" />
              Recipient Company &amp; Invoicing Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Recipient Company Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Aviation Pvt. Ltd. / Global Aerospace Inc."
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Mobile Number / Phone *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +91 98765 43210"
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  GST Number (Optional)
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. 36AABCU9603R1ZM"
                    value={companyGstin}
                    onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Company Identification Number (CIN) (Optional)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="e.g. U74999TG2020PTC123456"
                    value={companyCin}
                    onChange={(e) => setCompanyCin(e.target.value.toUpperCase())}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  required
                  value={invoiceDate}
                  onChange={(e) => handleInvoiceDateChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Registered / Billing Address
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Suite, Street Address, City, State, PIN / Postal Code, Country"
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent"
                  />
                </div>
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
                  <input
                    type="text"
                    placeholder="Auto-generated if left blank"
                    value={manualInvoiceNo}
                    onChange={(e) => setManualInvoiceNo(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-xs focus:ring-accent focus:border-accent font-mono"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Dual Currency & Daily Forex Rate Setting */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-navy-700" />
                <h3 className="text-sm font-bold text-gray-900">
                  Dual Currency &amp; Daily Exchange Rate
                </h3>
              </div>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {isCustomRate ? 'Custom User Rate' : `Daily Rate for ${exchangeRateDate}`}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Primary Billing Currency *
                </label>
                <div className="relative">
                  <select
                    value={currency}
                    onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent cursor-pointer font-medium bg-white"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {CURRENCY_CONFIG[c].label} - {CURRENCY_CONFIG[c].name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Dual Converted Currency *
                </label>
                {currency === 'INR' ? (
                  <select
                    value={convertedCurrency}
                    onChange={(e) =>
                      handleConvertedCurrencyChange(e.target.value as SupportedCurrency)
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent cursor-pointer font-medium bg-white"
                  >
                    <option value="USD">USD ($) - US Dollar</option>
                    <option value="NZD">NZD (NZ$) - New Zealand Dollar</option>
                    <option value="PHP">PHP (₱) - Philippine Peso</option>
                  </select>
                ) : (
                  <div className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 bg-gray-50 text-gray-700 font-semibold flex items-center justify-between">
                    <span>INR (₹) - Indian Rupee</span>
                    <span className="text-2xs font-normal text-gray-500">Auto-paired</span>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">
                    Rate: 1 {currency} in {convertedCurrency} *
                  </label>
                  <button
                    type="button"
                    onClick={() => fetchRate(currency, convertedCurrency, invoiceDate)}
                    disabled={isFetchingRate}
                    className="inline-flex items-center gap-1 text-2xs text-navy-700 hover:text-navy-900 font-semibold cursor-pointer disabled:opacity-50"
                    title="Refresh official exchange rate for invoice date"
                  >
                    {isFetchingRate ? (
                      <Loader2 className="w-3 h-3 animate-spin text-navy-700" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    Sync Rate
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={exchangeRate}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      setExchangeRate(val)
                      setIsCustomRate(true)
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 shadow-xs focus:ring-accent focus:border-accent font-mono font-bold bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="p-3 bg-linear-to-r from-blue-50/70 via-navy-50/40 to-emerald-50/50 rounded-lg border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-navy-700 shrink-0" />
                <span className="font-medium text-gray-800">
                  Daily Conversion:{' '}
                  <span className="font-mono font-bold text-navy-900">
                    {exchangeRateDisplay}
                  </span>
                </span>
              </div>
              <span className="text-2xs text-gray-500">
                Calculated for date {exchangeRateDate} · No scope for errors
              </span>
            </div>
          </div>

          {/* Card 3: Itemized Fee Heads & Tuition Charges */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-navy-700" />
                  Itemized Fee Heads &amp; Tuition Charges
                </h3>
                <span className="text-2xs text-gray-400">
                  Line items display both {currency} and {convertedCurrency} values simultaneously
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
                const itemQty = Number(item.quantity) || 1
                const itemPrice = Number(item.unit_price) || 0
                const itemPrimaryTotal = itemQty * itemPrice
                const itemSecondaryTotal = roundCurrency(itemPrimaryTotal * exchangeRate)

                return (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2.5"
                  >
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Student Name / Description *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma - CPL Ground School Module"
                          value={item.description}
                          onChange={(e) =>
                            handleUpdateItem(index, 'description', e.target.value)
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Qty
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          required
                          value={item.quantity}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            handleUpdateItem(
                              index,
                              'quantity',
                              Math.max(1, parseInt(e.target.value) || 1)
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-3">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Fee in {currency} ({currentCurrencySymbol}) *
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          required
                          placeholder="0.00"
                          value={item.unit_price === 0 ? '' : item.unit_price}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) =>
                            handleUpdateItem(
                              index,
                              'unit_price',
                              e.target.value === ''
                                ? 0
                                : Math.max(0, parseFloat(e.target.value) || 0)
                            )
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent bg-white font-mono"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-2xs font-medium text-gray-600 mb-1">
                          Equiv ({convertedCurrencySymbol})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0.00"
                          value={
                            item.unit_price === 0
                              ? ''
                              : roundCurrency(Number(item.unit_price) * exchangeRate)
                          }
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                            handleUpdateItemSecondary(index, val)
                          }}
                          className="w-full rounded-lg border border-emerald-200 bg-emerald-50/40 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent font-mono text-emerald-950"
                        />
                      </div>

                      <div className="col-span-1 flex items-center justify-end pb-1">
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

                    <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 text-2xs text-gray-500 font-mono">
                      <span>Line #{index + 1}</span>
                      <span className="font-semibold text-gray-900">
                        Line Total: {formatCurrencyWithSymbol(itemPrimaryTotal, currency)}{' '}
                        <span className="text-emerald-700 font-normal">
                          (≈ {formatCurrencyWithSymbol(itemSecondaryTotal, convertedCurrency)})
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Card 4: Notes and Payment Terms */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-navy-700" />
              Invoice Notes &amp; Remittance Guidelines
            </h3>
            <textarea
              rows={4}
              placeholder="Enter invoice notes and payment instructions..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-3 text-xs shadow-xs focus:ring-accent focus:border-accent"
            />
          </div>

          {/* Card 5: Company & Document Details (Editable Panel) */}
          <CompanyDetailsPanel onChange={setCompanyDetails} initialCollapsed={true} />
        </div>

        {/* Right Sidebar: Dual Currency Tax Invoice Summary Panel */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 sticky top-24">
            <div className="flex items-center gap-2 pb-3 border-b border-gray-100">
              <Sparkles className="w-4 h-4 text-navy-800" />
              <h3 className="text-sm font-bold text-gray-900">Corporate Invoice Summary</h3>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Gross Subtotal ({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                <div className="text-right">
                  <span className="font-semibold text-gray-900 font-mono block">
                    {formatCurrencyWithSymbol(subtotal, currency)}
                  </span>
                  <span className="text-2xs text-gray-500 font-mono">
                    ≈ {formatCurrencyWithSymbol(convertedSubtotal, convertedCurrency)}
                  </span>
                </div>
              </div>

              {/* Deductions Inputs */}
              <div className="space-y-3 pt-3 border-t border-gray-100">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-2xs font-medium text-gray-600">
                      General / Corporate Discount ({currentCurrencySymbol})
                    </label>
                    {sanitizedDiscount > 0 && (
                      <span className="text-2xs text-gray-400 font-mono">
                        ≈ {formatCurrencyWithSymbol(convertedDiscount, convertedCurrency)}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Enter discount amount"
                    value={discountAmount === 0 ? '' : discountAmount}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) =>
                      setDiscountAmount(
                        e.target.value === ''
                          ? 0
                          : Math.max(0, parseFloat(e.target.value) || 0)
                      )
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent font-mono"
                  />
                </div>
              </div>

              {/* Optional GST Section */}
              <div className="space-y-2.5 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="apply-gst-toggle"
                    className="text-xs font-semibold text-gray-900 cursor-pointer"
                  >
                    Apply GST (Optional)
                  </label>
                  <input
                    id="apply-gst-toggle"
                    type="checkbox"
                    checked={applyGst}
                    onChange={(e) => setApplyGst(e.target.checked)}
                    className="w-4 h-4 text-navy-800 rounded border-gray-300 focus:ring-accent cursor-pointer"
                  />
                </div>

                {applyGst && (
                  <div className="space-y-1 pt-1">
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
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) =>
                        setGstPercent(
                          e.target.value === ''
                            ? 0
                            : Math.max(0, parseFloat(e.target.value) || 0)
                        )
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs shadow-xs focus:ring-accent focus:border-accent font-mono"
                    />
                  </div>
                )}

                <div className="flex justify-between text-gray-600 pt-1">
                  <span>GST Tax Value {applyGst ? `(${gstPercent}%)` : '(Optional - Disabled)'}</span>
                  <div className="text-right">
                    <span className="font-semibold text-gray-900 font-mono block">
                      {applyGst ? `+ ${formatCurrencyWithSymbol(calculatedGst, currency)}` : '0.00'}
                    </span>
                    {applyGst && (
                      <span className="text-2xs text-gray-500 font-mono">
                        ≈ + {formatCurrencyWithSymbol(convertedGst, convertedCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Net Grand Total Card - Dual Currency Presentation */}
              <div className="p-4 rounded-xl bg-navy-50/70 border border-navy-100 space-y-2 text-navy-950">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider block">Grand Total</span>
                    <span className="text-[10px] text-gray-500 font-normal">
                      Billing Currency: {currency} ({currentCurrencySymbol})
                    </span>
                  </div>
                  <span className="text-xl font-extrabold text-navy-900 font-mono">
                    {formatCurrencyWithSymbol(grandTotal, currency)}
                  </span>
                </div>

                <div className="pt-2 border-t border-navy-200/50 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-emerald-900 block">
                      Dual Equivalent ({convertedCurrency})
                    </span>
                    <span className="text-[10px] text-gray-500">
                      Calculated as of {exchangeRateDate}
                    </span>
                  </div>
                  <span className="text-base font-bold text-emerald-800 font-mono">
                    {formatCurrencyWithSymbol(convertedGrandTotal, convertedCurrency)}
                  </span>
                </div>

                <div className="pt-1.5 border-t border-navy-100 text-[10px] text-gray-500 font-mono flex items-center justify-between">
                  <span>Exchange Rate:</span>
                  <span className="font-semibold text-navy-900">{exchangeRateDisplay}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => saveMutation.mutate(false)}
                disabled={saveMutation.isPending}
                className="w-full py-2.5 px-4 text-xs font-bold uppercase tracking-wider text-white bg-navy-800 hover:bg-navy-900 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saveMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {isEditing ? 'Update & Save' : 'Generate & Issue Invoice'}
              </button>

              <button
                type="button"
                onClick={() => saveMutation.mutate(true)}
                disabled={saveMutation.isPending}
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
