import { createClient } from '@/lib/supabase/client'
import { NUMBERING_CONFIG } from './config'
import { getFinancialYearLabel, getMonthYearLabel } from './financial-year'
import type { SupabaseClient } from '@supabase/supabase-js'

export { getFinancialYearLabel, getMonthYearLabel, NUMBERING_CONFIG }

/**
 * Executes atomic SQL sequence increment on Postgres to ensure zero duplicate numbers under high concurrency.
 */
export async function getNextAtomicSequence(
  docType: string,
  fyLabel: string,
  client?: SupabaseClient
): Promise<number> {
  const supabase = client || createClient()
  const { data, error } = await supabase.rpc('get_next_document_number', {
    p_doc_type: docType,
    p_fy_label: fyLabel,
  })

  if (error) {
    throw new Error(
      `NumberingEngineError: Failed to obtain sequence for ${docType} / ${fyLabel}: ${error.message}`
    )
  }

  return Number(data)
}

/**
 * Format 1: Quotation
 * Rules: Never resets, continuously increments.
 * Format: AV/QT/00001
 */
export async function generateQuotationNumber(client?: SupabaseClient): Promise<string> {
  const seq = await getNextAtomicSequence(
    NUMBERING_CONFIG.DOC_TYPES.QUOTATION,
    NUMBERING_CONFIG.GLOBAL_FY_LABEL,
    client
  )

  const paddedSeq = seq.toString().padStart(NUMBERING_CONFIG.SEQUENCE_PADDING_LENGTH, '0')
  return [NUMBERING_CONFIG.DOC_PREFIX, NUMBERING_CONFIG.DOC_TYPES.QUOTATION, paddedSeq].join(
    NUMBERING_CONFIG.SEPARATOR
  )
}

/**
 * Format 2: Invoice
 * Rules: Resets every Indian Financial Year (April 1 - March 31).
 * Format: AV/INV/2026-27/00001
 */
export async function generateInvoiceNumber(
  date: Date | string | number = new Date(),
  client?: SupabaseClient
): Promise<string> {
  const fyLabel = getFinancialYearLabel(date)
  const seq = await getNextAtomicSequence(
    NUMBERING_CONFIG.DOC_TYPES.INVOICE,
    fyLabel,
    client
  )

  const paddedSeq = seq.toString().padStart(NUMBERING_CONFIG.SEQUENCE_PADDING_LENGTH, '0')
  return [
    NUMBERING_CONFIG.DOC_PREFIX,
    NUMBERING_CONFIG.DOC_TYPES.INVOICE,
    fyLabel,
    paddedSeq,
  ].join(NUMBERING_CONFIG.SEPARATOR)
}

/**
 * Format 3: Receipt (Billing Slips / Payment Receipts)
 * Rules: Resets every Indian Financial Year (April 1 - March 31).
 * Format: AV/RCT/2026-27/00001
 */
export async function generateReceiptNumber(
  date: Date | string | number = new Date(),
  client?: SupabaseClient
): Promise<string> {
  const fyLabel = getFinancialYearLabel(date)
  const seq = await getNextAtomicSequence(
    NUMBERING_CONFIG.DOC_TYPES.RECEIPT,
    fyLabel,
    client
  )

  const paddedSeq = seq.toString().padStart(NUMBERING_CONFIG.SEQUENCE_PADDING_LENGTH, '0')
  return [
    NUMBERING_CONFIG.DOC_PREFIX,
    NUMBERING_CONFIG.DOC_TYPES.RECEIPT,
    fyLabel,
    paddedSeq,
  ].join(NUMBERING_CONFIG.SEPARATOR)
}

/**
 * Format 4: Payslip
 * Rules: Month-based sequence increment across all monthly disbursements, appended with faculty identifier.
 * Format: AV/PAY/2026-08/FAC012
 */
export async function generatePayslipNumber(
  date: Date | string | number = new Date(),
  facultyCodeOrClient?: string | SupabaseClient,
  client?: SupabaseClient
): Promise<string> {
  let dbClient = client

  if (facultyCodeOrClient && typeof facultyCodeOrClient === 'object') {
    dbClient = facultyCodeOrClient as SupabaseClient
  }

  const fyLabel = getFinancialYearLabel(date)
  const seq = await getNextAtomicSequence(
    NUMBERING_CONFIG.DOC_TYPES.PAYSLIP,
    fyLabel,
    dbClient
  )

  const paddedSeq = seq.toString().padStart(NUMBERING_CONFIG.SEQUENCE_PADDING_LENGTH, '0')
  return [
    NUMBERING_CONFIG.DOC_PREFIX,
    NUMBERING_CONFIG.DOC_TYPES.PAYSLIP,
    fyLabel,
    paddedSeq,
  ].join(NUMBERING_CONFIG.SEPARATOR)
}

/**
 * Format 5: Company Invoice (Corporate B2B Invoices)
 * Rules: Resets every Indian Financial Year (April 1 - March 31).
 * Format: AV/C-INV/2026-27/00001
 */
export async function generateCompanyInvoiceNumber(
  date: Date | string | number = new Date(),
  client?: SupabaseClient
): Promise<string> {
  const fyLabel = getFinancialYearLabel(date)
  const seq = await getNextAtomicSequence(
    NUMBERING_CONFIG.DOC_TYPES.COMPANY_INVOICE,
    fyLabel,
    client
  )

  const paddedSeq = seq.toString().padStart(NUMBERING_CONFIG.SEQUENCE_PADDING_LENGTH, '0')
  return [
    NUMBERING_CONFIG.DOC_PREFIX,
    NUMBERING_CONFIG.DOC_TYPES.COMPANY_INVOICE,
    fyLabel,
    paddedSeq,
  ].join(NUMBERING_CONFIG.SEPARATOR)
}
