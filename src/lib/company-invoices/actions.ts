import { createClient } from '@/lib/supabase/client'
import { generateCompanyInvoiceNumber } from '@/lib/numbering/generate-number'
import { getFinancialYearLabel } from '@/lib/numbering/financial-year'
import { roundCurrency } from '@/lib/utils/currency'
import { getDefaultConvertedCurrency } from '@/lib/utils/exchange-rates'
import type {
  CompanyInvoice,
  CompanyInvoiceItem,
  CompanyInvoiceStatus,
  SupportedCurrency,
} from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateCompanyInvoiceItemInput {
  description: string
  quantity: number
  unit_price: number
  converted_unit_price?: number
  converted_line_total?: number
}

export interface CreateCompanyInvoiceInput {
  companyName: string
  companyPhone: string
  companyAddress?: string | null
  companyGstin?: string | null
  companyCin?: string | null
  currency: SupportedCurrency
  convertedCurrency?: SupportedCurrency | null
  exchangeRate?: number
  exchangeRateDate?: string
  invoiceDate: string // YYYY-MM-DD
  dueDate: string // YYYY-MM-DD
  items: CreateCompanyInvoiceItemInput[]
  discountAmount?: number
  applyGst?: boolean
  gstPercent?: number
  notes?: string | null
  saveAsDraft?: boolean
  manualInvoiceNo?: string | null
}

export interface CreateCompanyInvoiceResult {
  invoice_id: string
  invoice_no: string
  subtotal: number
  gst_amount: number
  grand_total: number
  converted_grand_total?: number
  status: CompanyInvoiceStatus
}

/**
 * Creates a new independent Company Invoice and its line items.
 */
export async function createCompanyInvoice(
  input: CreateCompanyInvoiceInput,
  client?: SupabaseClient
): Promise<CreateCompanyInvoiceResult> {
  const supabase = client || createClient()

  const companyName = input.companyName?.trim()
  if (!companyName) {
    throw new Error('Company name is required')
  }

  const companyPhone = input.companyPhone?.trim()
  if (!companyPhone) {
    throw new Error('Company mobile / phone number is required')
  }

  if (!input.dueDate) {
    throw new Error('Invoice payment due date is required')
  }

  if (!input.items || input.items.length === 0) {
    throw new Error('At least one item is required')
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]
    if (!item.description?.trim()) {
      throw new Error(`Item ${i + 1}: Student Name / Description cannot be empty`)
    }
    if ((Number(item.quantity) || 0) <= 0) {
      throw new Error(`Item ${i + 1}: Quantity must be greater than zero`)
    }
    if ((Number(item.unit_price) || 0) < 0) {
      throw new Error(`Item ${i + 1}: Fee / Amount cannot be negative`)
    }
  }

  // Generate sequence number or format manual invoice number
  const invoiceDate = input.invoiceDate || new Date().toISOString().split('T')[0]
  const fyLabel = getFinancialYearLabel(invoiceDate)

  let invoiceNo: string
  if (input.manualInvoiceNo?.trim()) {
    const digitsOnly = input.manualInvoiceNo.trim().replace(/\D/g, '')
    if (!digitsOnly || parseInt(digitsOnly, 10) <= 0) {
      throw new Error('Manual invoice number must be a positive integer')
    }
    const num = parseInt(digitsOnly, 10)
    invoiceNo = `AV/C-INV/${fyLabel}/${String(num).padStart(5, '0')}`
  } else {
    invoiceNo = await generateCompanyInvoiceNumber(invoiceDate, supabase)
  }

  const convertedCurrency: SupportedCurrency =
    input.convertedCurrency || getDefaultConvertedCurrency(input.currency)
  const exchangeRate = Number(input.exchangeRate) > 0 ? Number(input.exchangeRate) : 1
  const exchangeRateDate = input.exchangeRateDate || invoiceDate

  // Calculate items and line totals
  const processedItems = input.items.map((it) => {
    const qty = Number(it.quantity) || 1
    const price = Number(it.unit_price) || 0
    const lineTotal = roundCurrency(qty * price)
    const convertedUnitPrice = roundCurrency(price * exchangeRate)
    const convertedLineTotal = roundCurrency(lineTotal * exchangeRate)
    return {
      description: it.description.trim(),
      quantity: qty,
      unit_price: price,
      line_total: lineTotal,
      currency: input.currency,
      converted_unit_price: convertedUnitPrice,
      converted_line_total: convertedLineTotal,
    }
  })

  const subtotal = roundCurrency(processedItems.reduce((acc, it) => acc + it.line_total, 0))
  const discountAmount = roundCurrency(Math.max(0, Number(input.discountAmount) || 0))
  const taxableAmount = Math.max(0, subtotal - discountAmount)

  const applyGst = !!input.applyGst
  const gstPercent = applyGst ? Number(input.gstPercent ?? 18) : 0
  const gstAmount = applyGst ? roundCurrency((taxableAmount * gstPercent) / 100) : 0
  const grandTotal = roundCurrency(taxableAmount + gstAmount)

  const convertedSubtotal = roundCurrency(subtotal * exchangeRate)
  const convertedDiscountAmount = roundCurrency(discountAmount * exchangeRate)
  const convertedGstAmount = roundCurrency(gstAmount * exchangeRate)
  const convertedGrandTotal = roundCurrency(grandTotal * exchangeRate)

  const status: CompanyInvoiceStatus = input.saveAsDraft ? 'draft' : 'sent'

  // Insert company_invoice
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('company_invoices')
    .insert({
      invoice_no: invoiceNo,
      fy_label: fyLabel,
      company_name: companyName,
      company_phone: companyPhone,
      company_address: input.companyAddress?.trim() || null,
      company_gstin: input.companyGstin?.trim() || null,
      company_cin: input.companyCin?.trim() || null,
      currency: input.currency,
      invoice_date: invoiceDate,
      due_date: input.dueDate,
      subtotal,
      discount_amount: discountAmount,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      grand_total: grandTotal,
      converted_currency: convertedCurrency,
      exchange_rate: exchangeRate,
      exchange_rate_date: exchangeRateDate,
      converted_subtotal: convertedSubtotal,
      converted_discount_amount: convertedDiscountAmount,
      converted_gst_amount: convertedGstAmount,
      converted_grand_total: convertedGrandTotal,
      status,
      notes: input.notes?.trim() || null,
    })
    .select('id, invoice_no, subtotal, gst_amount, grand_total, converted_grand_total, status')
    .single()

  if (invoiceError || !invoiceData) {
    throw new Error(invoiceError?.message || 'Failed to create company invoice record')
  }

  // Insert items
  const itemsToInsert = processedItems.map((it) => ({
    company_invoice_id: invoiceData.id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    currency: it.currency,
    converted_unit_price: it.converted_unit_price,
    converted_line_total: it.converted_line_total,
  }))

  const { error: itemsError } = await supabase
    .from('company_invoice_items')
    .insert(itemsToInsert)

  if (itemsError) {
    // Attempt cleanup if items failed
    await supabase.from('company_invoices').delete().eq('id', invoiceData.id)
    throw new Error(itemsError.message || 'Failed to insert company invoice line items')
  }

  return {
    invoice_id: invoiceData.id,
    invoice_no: invoiceData.invoice_no,
    subtotal: Number(invoiceData.subtotal),
    gst_amount: Number(invoiceData.gst_amount),
    grand_total: Number(invoiceData.grand_total),
    converted_grand_total: Number(invoiceData.converted_grand_total),
    status: invoiceData.status as CompanyInvoiceStatus,
  }
}

/**
 * Updates company invoice status (e.g. draft -> sent -> paid or cancelled).
 */
export async function updateCompanyInvoiceStatus(
  id: string,
  status: CompanyInvoiceStatus,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client || createClient()
  const { error } = await supabase
    .from('company_invoices')
    .update({ status })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

export interface UpdateCompanyInvoiceInput extends CreateCompanyInvoiceInput {
  id: string
}

/**
 * Updates an existing company invoice and replaces its line items.
 */
export async function updateCompanyInvoice(
  input: UpdateCompanyInvoiceInput,
  client?: SupabaseClient
): Promise<CreateCompanyInvoiceResult> {
  const supabase = client || createClient()

  const companyName = input.companyName?.trim()
  if (!companyName) {
    throw new Error('Company name is required')
  }

  const companyPhone = input.companyPhone?.trim()
  if (!companyPhone) {
    throw new Error('Company mobile / phone number is required')
  }

  if (!input.dueDate) {
    throw new Error('Invoice payment due date is required')
  }

  if (!input.items || input.items.length === 0) {
    throw new Error('At least one item is required')
  }

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]
    if (!item.description?.trim()) {
      throw new Error(`Item ${i + 1}: Student Name / Description cannot be empty`)
    }
    if ((Number(item.quantity) || 0) <= 0) {
      throw new Error(`Item ${i + 1}: Quantity must be greater than zero`)
    }
    if ((Number(item.unit_price) || 0) < 0) {
      throw new Error(`Item ${i + 1}: Fee / Amount cannot be negative`)
    }
  }

  const invoiceDate = input.invoiceDate || new Date().toISOString().split('T')[0]
  const fyLabel = getFinancialYearLabel(invoiceDate)

  const convertedCurrency: SupportedCurrency =
    input.convertedCurrency || getDefaultConvertedCurrency(input.currency)
  const exchangeRate = Number(input.exchangeRate) > 0 ? Number(input.exchangeRate) : 1
  const exchangeRateDate = input.exchangeRateDate || invoiceDate

  // Calculate items and line totals
  const processedItems = input.items.map((it) => {
    const qty = Number(it.quantity) || 1
    const price = Number(it.unit_price) || 0
    const lineTotal = roundCurrency(qty * price)
    const convertedUnitPrice = roundCurrency(price * exchangeRate)
    const convertedLineTotal = roundCurrency(lineTotal * exchangeRate)
    return {
      description: it.description.trim(),
      quantity: qty,
      unit_price: price,
      line_total: lineTotal,
      currency: input.currency,
      converted_unit_price: convertedUnitPrice,
      converted_line_total: convertedLineTotal,
    }
  })

  const subtotal = roundCurrency(processedItems.reduce((acc, it) => acc + it.line_total, 0))
  const discountAmount = roundCurrency(Math.max(0, Number(input.discountAmount) || 0))
  const taxableAmount = Math.max(0, subtotal - discountAmount)

  const applyGst = !!input.applyGst
  const gstPercent = applyGst ? Number(input.gstPercent ?? 18) : 0
  const gstAmount = applyGst ? roundCurrency((taxableAmount * gstPercent) / 100) : 0
  const grandTotal = roundCurrency(taxableAmount + gstAmount)

  const convertedSubtotal = roundCurrency(subtotal * exchangeRate)
  const convertedDiscountAmount = roundCurrency(discountAmount * exchangeRate)
  const convertedGstAmount = roundCurrency(gstAmount * exchangeRate)
  const convertedGrandTotal = roundCurrency(grandTotal * exchangeRate)

  const status: CompanyInvoiceStatus = input.saveAsDraft ? 'draft' : 'sent'

  // Update company_invoices
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('company_invoices')
    .update({
      fy_label: fyLabel,
      company_name: companyName,
      company_phone: companyPhone,
      company_address: input.companyAddress?.trim() || null,
      company_gstin: input.companyGstin?.trim() || null,
      company_cin: input.companyCin?.trim() || null,
      currency: input.currency,
      invoice_date: invoiceDate,
      due_date: input.dueDate,
      subtotal,
      discount_amount: discountAmount,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      grand_total: grandTotal,
      converted_currency: convertedCurrency,
      exchange_rate: exchangeRate,
      exchange_rate_date: exchangeRateDate,
      converted_subtotal: convertedSubtotal,
      converted_discount_amount: convertedDiscountAmount,
      converted_gst_amount: convertedGstAmount,
      converted_grand_total: convertedGrandTotal,
      status,
      notes: input.notes?.trim() || null,
    })
    .eq('id', input.id)
    .select('id, invoice_no, subtotal, gst_amount, grand_total, converted_grand_total, status')
    .single()

  if (invoiceError || !invoiceData) {
    throw new Error(invoiceError?.message || 'Failed to update company invoice record')
  }

  // Replace line items: delete old and insert new
  const { error: deleteOldError } = await supabase
    .from('company_invoice_items')
    .delete()
    .eq('company_invoice_id', input.id)

  if (deleteOldError) {
    throw new Error(deleteOldError.message || 'Failed to clear old company invoice line items')
  }

  const itemsToInsert = processedItems.map((it) => ({
    company_invoice_id: input.id,
    description: it.description,
    quantity: it.quantity,
    unit_price: it.unit_price,
    line_total: it.line_total,
    currency: it.currency,
    converted_unit_price: it.converted_unit_price,
    converted_line_total: it.converted_line_total,
  }))

  const { error: itemsError } = await supabase
    .from('company_invoice_items')
    .insert(itemsToInsert)

  if (itemsError) {
    throw new Error(itemsError.message || 'Failed to insert updated company invoice line items')
  }

  return {
    invoice_id: invoiceData.id,
    invoice_no: invoiceData.invoice_no,
    subtotal: Number(invoiceData.subtotal),
    gst_amount: Number(invoiceData.gst_amount),
    grand_total: Number(invoiceData.grand_total),
    converted_grand_total: Number(invoiceData.converted_grand_total),
    status: invoiceData.status as CompanyInvoiceStatus,
  }
}

/**
 * Deletes a company invoice (and cascades to line items).
 */
export async function deleteCompanyInvoice(
  id: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client || createClient()
  const { error } = await supabase
    .from('company_invoices')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}
