import { NextResponse } from 'next/server'
import { getExchangeRate } from '@/lib/utils/exchange-rates'
import type { SupportedCurrency } from '@/types/database'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const from = (searchParams.get('from') || 'USD') as SupportedCurrency
    const to = (searchParams.get('to') || 'INR') as SupportedCurrency
    const date = searchParams.get('date') || undefined

    const result = await getExchangeRate(from, to, date)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch exchange rate' },
      { status: 500 }
    )
  }
}
