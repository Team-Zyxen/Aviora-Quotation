/**
 * Numbering Engine Configuration
 * Single source of truth for all prefix, document code, and separator formats.
 */

export const NUMBERING_CONFIG = {
  // Global organization prefix
  DOC_PREFIX: 'AV',

  // Document type codes
  DOC_TYPES: {
    QUOTATION: 'QT',
    INVOICE: 'INV',
    RECEIPT: 'RCT',
    PAYSLIP: 'PAY',
    COMPANY_INVOICE: 'C-INV',
  },

  // Standard zero-padding length for sequential numbers
  SEQUENCE_PADDING_LENGTH: 5,

  // Path / segment separator
  SEPARATOR: '/',

  // Fallback / global FY label for non-resetting documents like Quotations
  GLOBAL_FY_LABEL: 'GLOBAL',
} as const

export type DocumentTypeKey = keyof typeof NUMBERING_CONFIG.DOC_TYPES
