import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { CompanyInvoicePdfDocument } from '@/lib/pdf/CompanyInvoicePdfDocument'
import type { CompanyInvoice, CompanySettings } from '@/types/database'

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  const { id } = params
  const supabase = await createClient()

  // Fetch company invoice with line items
  const { data: invoiceData, error: invoiceError } = await supabase
    .from('company_invoices')
    .select(`
      *,
      company_invoice_items (*)
    `)
    .eq('id', id)
    .single()

  if (invoiceError || !invoiceData) {
    return NextResponse.json({ error: 'Company invoice record not found' }, { status: 404 })
  }

  // Fetch company branding & settings
  const { data: settingsData } = await supabase
    .from('company_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  const invoice = invoiceData as unknown as CompanyInvoice
  const settings = (settingsData || null) as unknown as CompanySettings

  const pdfBuffer = await renderToBuffer(
    React.createElement(CompanyInvoicePdfDocument, {
      invoice,
      settings,
    }) as unknown as Parameters<typeof renderToBuffer>[0]
  )

  const sanitizedInvoiceNo = invoice.invoice_no.replace(/\//g, '_')
  const filename = `CompanyInvoice_${sanitizedInvoiceNo}.pdf`

  return new NextResponse(pdfBuffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
