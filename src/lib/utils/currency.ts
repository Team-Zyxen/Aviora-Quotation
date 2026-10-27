import type { SupportedCurrency } from '@/types/database'

export type { SupportedCurrency }

export const CURRENCY_CONFIG: Record<
  SupportedCurrency,
  {
    code: SupportedCurrency
    symbol: string
    label: string
    name: string
    locale: string
  }
> = {
  INR: {
    code: 'INR',
    symbol: '₹',
    label: 'INR (₹)',
    name: 'Indian Rupee',
    locale: 'en-IN',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    label: 'USD ($)',
    name: 'US Dollar',
    locale: 'en-US',
  },
  NZD: {
    code: 'NZD',
    symbol: 'NZ$',
    label: 'NZD (NZ$)',
    name: 'New Zealand Dollar',
    locale: 'en-NZ',
  },
  PHP: {
    code: 'PHP',
    symbol: '₱',
    label: 'PHP (₱)',
    name: 'Philippine Peso',
    locale: 'en-PH',
  },
}

/**
 * Returns the standard display symbol for a supported currency.
 */
export function getCurrencySymbol(currency: SupportedCurrency = 'INR'): string {
  return CURRENCY_CONFIG[currency]?.symbol || '₹'
}

/**
 * Formats a given number into Indian Rupees (INR) with the correct comma grouping.
 * E.g., 123456 -> ₹1,23,456.00
 * 
 * Note: As per project rules, all money values should be formatted using this utility.
 * In the database, money columns must be numeric(12,2).
 */
export function formatCurrency(amount: number): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Formats an amount with the appropriate currency symbol and locale grouping.
 * Supports INR (₹), USD ($), NZD (NZ$), and PHP (₱).
 */
export function formatCurrencyWithSymbol(
  amount: number | string,
  currency: SupportedCurrency = 'INR'
): string {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0
  const conf = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.INR

  if (conf.code === 'NZD') {
    const formatted = new Intl.NumberFormat('en-NZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
    return `NZ$ ${formatted}`
  }

  try {
    return new Intl.NumberFormat(conf.locale, {
      style: 'currency',
      currency: conf.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num)
  } catch {
    return `${conf.symbol} ${num.toFixed(2)}`
  }
}

/**
 * Standard rounding helper for monetary calculations (2 decimal places).
 * Ensures consistency across calculations throughout the entire system.
 */
export function roundCurrency(amount: number | string): number {
  const num = typeof amount === 'number' ? amount : Number(amount) || 0
  return Math.round(num * 100) / 100
}
