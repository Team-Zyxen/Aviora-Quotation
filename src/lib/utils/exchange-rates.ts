import type { SupportedCurrency } from '@/types/database'
import { roundCurrency } from './currency'

export interface ExchangeRateResult {
  from: SupportedCurrency
  to: SupportedCurrency
  rate: number
  date: string
  source: 'frankfurter' | 'open.er-api' | 'benchmark'
  label: string
}

const FALLBACK_BENCHMARKS: Record<string, number> = {
  USD_INR: 86.5,
  INR_USD: 1 / 86.5,
  NZD_INR: 51.5,
  INR_NZD: 1 / 51.5,
  PHP_INR: 1.5,
  INR_PHP: 1 / 1.5,
  USD_NZD: 1.68,
  NZD_USD: 1 / 1.68,
  USD_PHP: 57.6,
  PHP_USD: 1 / 57.6,
  NZD_PHP: 34.3,
  PHP_NZD: 1 / 34.3,
}

// In-memory cache for fast repeated lookups
const rateCache = new Map<string, ExchangeRateResult>()

/**
 * Returns human-friendly rate string (e.g., "1 USD = ₹95.1800" or "1 INR = $0.0105 (1 USD = ₹95.1800)")
 */
export function formatExchangeRateDisplay(
  from: SupportedCurrency,
  to: SupportedCurrency,
  rate: number
): string {
  if (from === to) return `1 ${from} = 1 ${to}`

  if (from === 'INR' && to !== 'INR') {
    const inverse = rate > 0 ? (1 / rate).toFixed(4) : '0'
    return `1 INR = ${rate.toFixed(4)} ${to} (1 ${to} = ₹${inverse})`
  }

  const symbolTo = to === 'INR' ? '₹' : to === 'USD' ? '$' : to === 'NZD' ? 'NZ$' : '₱'
  return `1 ${from} = ${symbolTo}${rate.toFixed(4)} ${to}`
}

/**
 * Automatically chooses the standard secondary currency:
 * - If USD, NZD, or PHP -> INR
 * - If INR -> USD
 */
export function getDefaultConvertedCurrency(currency: SupportedCurrency): SupportedCurrency {
  return currency === 'INR' ? 'USD' : 'INR'
}

/**
 * Fetches the daily official foreign exchange rate for a given date.
 * - Primary source: European Central Bank / Frankfurter API (historical & latest)
 * - Secondary source: Open Exchange Rates public endpoint
 * - Tertiary source: Curated benchmark exchange rates
 */
export async function getExchangeRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
  targetDate?: string
): Promise<ExchangeRateResult> {
  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      date: targetDate || new Date().toISOString().split('T')[0],
      source: 'benchmark',
      label: `1 ${from} = 1 ${to}`,
    }
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const cleanDate = targetDate && targetDate <= todayStr ? targetDate : 'latest'
  const cacheKey = `${from}_${to}_${cleanDate}`

  if (rateCache.has(cacheKey)) {
    return rateCache.get(cacheKey)!
  }

  // 1. Try Frankfurter API
  try {
    const url = `https://api.frankfurter.app/${cleanDate}?from=${encodeURIComponent(
      from
    )}&to=${encodeURIComponent(to)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json()
      const rawRate = Number(data?.rates?.[to])
      if (rawRate && rawRate > 0) {
        const result: ExchangeRateResult = {
          from,
          to,
          rate: rawRate,
          date: data.date || todayStr,
          source: 'frankfurter',
          label: formatExchangeRateDisplay(from, to, rawRate),
        }
        rateCache.set(cacheKey, result)
        return result
      }
    }
  } catch (err) {
    // Frankfurter failed or timed out, proceed to secondary provider
  }

  // 2. Try Open Exchange Rates API
  try {
    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)

    if (res.ok) {
      const data = await res.json()
      const rawRate = Number(data?.rates?.[to])
      if (rawRate && rawRate > 0) {
        const dateStr = data.time_last_update_utc
          ? new Date(data.time_last_update_utc).toISOString().split('T')[0]
          : todayStr
        const result: ExchangeRateResult = {
          from,
          to,
          rate: rawRate,
          date: dateStr,
          source: 'open.er-api',
          label: formatExchangeRateDisplay(from, to, rawRate),
        }
        rateCache.set(cacheKey, result)
        return result
      }
    }
  } catch (err) {
    // Secondary failed, proceed to fallback benchmark
  }

  // 3. Fallback Benchmark
  const pairKey = `${from}_${to}`
  const fallbackRate = FALLBACK_BENCHMARKS[pairKey] || 1
  const fallbackResult: ExchangeRateResult = {
    from,
    to,
    rate: fallbackRate,
    date: todayStr,
    source: 'benchmark',
    label: formatExchangeRateDisplay(from, to, fallbackRate),
  }
  rateCache.set(cacheKey, fallbackResult)
  return fallbackResult
}
