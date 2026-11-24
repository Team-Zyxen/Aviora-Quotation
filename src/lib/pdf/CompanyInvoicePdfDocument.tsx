import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'
import {
  PdfHeader,
  PdfStatusRibbon,
  PdfBankDetails,
  pdfColors,
  pdfStyles,
} from './branding'
import {
  formatCurrencyWithSymbol,
  getCurrencySymbol,
  roundCurrency,
} from '@/lib/utils/currency'
import { formatExchangeRateDisplay } from '@/lib/utils/exchange-rates'
import type { CompanyInvoice, CompanySettings, SupportedCurrency } from '@/types/database'

let cachedOnestopLogoDataUri: string | null = null

function getOnestopLogoDataUri(): string | null {
  if (cachedOnestopLogoDataUri) return cachedOnestopLogoDataUri
  try {
    const logoPath = path.join(process.cwd(), 'public', 'onestop-aviation-logo.png')
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath)
      cachedOnestopLogoDataUri = `data:image/png;base64,${buffer.toString('base64')}`
      return cachedOnestopLogoDataUri
    }
  } catch (err) {
    console.error('Error reading Onestop logo file for PDF:', err)
  }
  return null
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: pdfColors.navy,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: pdfColors.navy,
    paddingVertical: 5.5,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: pdfColors.borderGray,
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 8,
    backgroundColor: pdfColors.bgCream,
  },
  headerColNo: { width: '5%', color: '#FFFFFF', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },
  headerColDesc: { width: '39%', color: '#FFFFFF', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },
  headerColQty: { width: '8%', textAlign: 'center', color: '#FFFFFF', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },
  headerColRate: { width: '16%', textAlign: 'right', color: '#FFFFFF', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },
  headerColEquiv: { width: '16%', textAlign: 'right', color: '#D1FAE5', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },
  headerColTotal: { width: '16%', textAlign: 'right', color: '#FFFFFF', fontWeight: 'bold', fontSize: 7.5, textTransform: 'uppercase' },

  colNo: { width: '5%', color: pdfColors.textMuted },
  colDesc: { width: '39%', color: pdfColors.navy, fontWeight: 'medium' },
  colQty: { width: '8%', textAlign: 'center', color: pdfColors.navy },
  colRate: { width: '16%', textAlign: 'right', color: pdfColors.navy },
  colEquiv: { width: '16%', textAlign: 'right', color: '#047857', fontWeight: 'medium' },
  colTotal: { width: '16%', textAlign: 'right', fontWeight: 'bold', color: pdfColors.navy },

  totalsBlock: {
    width: '48%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2.5,
    fontSize: 8,
  },

  // Custom Company Invoice Footer with Onestop Logo and Computer-Generated Notice
  footerContainer: {
    marginTop: 'auto',
    paddingTop: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  onestopBlock: {
    width: '58%',
    alignItems: 'flex-start',
  },
  onestopLogo: {
    width: 76,
    height: 50,
    objectFit: 'contain',
    marginBottom: 3,
  },
  onestopUnitText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: pdfColors.navy,
    marginBottom: 2,
  },
  footerContact: {
    fontSize: 7.5,
    color: pdfColors.textMuted,
  },
  signatureBlock: {
    width: '40%',
    alignItems: 'flex-end',
  },
  signatureBox: {
    width: 185,
    borderWidth: 0.8,
    borderColor: pdfColors.navy,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    textAlign: 'center',
  },
  signatureTitle: {
    fontSize: 8,
    fontWeight: 'bold',
    color: pdfColors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  signatureSubtitle: {
    fontSize: 7,
    color: '#334155',
    textAlign: 'center',
    lineHeight: 1.3,
  },
})

interface CompanyInvoicePdfDocumentProps {
  invoice: CompanyInvoice
  settings?: Partial<CompanySettings> | null
}

export function CompanyInvoicePdfDocument({ invoice, settings }: CompanyInvoicePdfDocumentProps) {
  const items = invoice.company_invoice_items || []
  const currency = invoice.currency || 'INR'
  const currencySymbol = getCurrencySymbol(currency)
  const convertedCurrency: SupportedCurrency =
    invoice.converted_currency || (invoice.currency === 'INR' ? 'USD' : 'INR')
  const convertedCurrencySymbol = getCurrencySymbol(convertedCurrency)
  const exchangeRate = Number(invoice.exchange_rate) || 1
  const exchangeRateDate = invoice.exchange_rate_date || invoice.invoice_date
  const rateLabel = formatExchangeRateDisplay(currency, convertedCurrency, exchangeRate)

  const convertedGrandTotal = invoice.converted_grand_total
    ? Number(invoice.converted_grand_total)
    : roundCurrency(invoice.grand_total * exchangeRate)
  const convertedSubtotal = invoice.converted_subtotal
    ? Number(invoice.converted_subtotal)
    : roundCurrency(invoice.subtotal * exchangeRate)
  const convertedGstAmount = invoice.converted_gst_amount
    ? Number(invoice.converted_gst_amount)
    : roundCurrency(invoice.gst_amount * exchangeRate)
  const convertedDiscountAmount = invoice.converted_discount_amount
    ? Number(invoice.converted_discount_amount)
    : roundCurrency((invoice.discount_amount || 0) * exchangeRate)

  const termsText =
    settings?.terms_and_conditions_text ||
    '1. Payment must reference this company invoice number.\n2. Invoices overdue beyond 15 days may incur finance service fees.\n3. Bank account remittance details provided below.'

  const isGstApplied = Number(invoice.gst_percent) > 0 && Number(invoice.gst_amount) > 0

  const phone = settings?.phone || settings?.company_phone || '+91 63093 42416'
  const email = settings?.company_email || 'Fly@avioraacademy.com'
  const onestopLogoDataUri = getOnestopLogoDataUri()

  return (
    <Document title={`Company Invoice - ${invoice.invoice_no}`} author="Aviora Finance">
      <Page size="A4" style={pdfStyles.page}>
        {/* Solid Top Edge Bar */}
        <View style={pdfStyles.topEdgeBar} />

        {/* Page Inner Container */}
        <View style={pdfStyles.bodyContent}>
          {/* Header Row with Address, Tax IDs & Fixed Logo */}
          <PdfHeader settings={settings} />

          {/* Document Title */}
          <Text style={pdfStyles.docTitle}>
            {isGstApplied ? 'TAX INVOICE' : 'COMMERCIAL INVOICE'}
          </Text>

          {/* Two-Tone Angled Status Ribbon */}
          <PdfStatusRibbon
            title="CORPORATE COMPANY INVOICE"
            subtitle={`${invoice.invoice_no} (${invoice.fy_label})`}
          />

          {/* Side-by-side Info Cards */}
          <View style={pdfStyles.infoBoxesGrid}>
            {/* Left Card: BILLED TO (COMPANY) */}
            <View style={pdfStyles.infoBoxCard}>
              <Text style={pdfStyles.infoBoxTitle}>BILLED TO (COMPANY)</Text>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Company Name:</Text>
                <Text style={pdfStyles.infoBoxValue}>{invoice.company_name}</Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Mobile / Phone:</Text>
                <Text style={pdfStyles.infoBoxValue}>{invoice.company_phone}</Text>
              </View>
              {invoice.company_address && (
                <View style={pdfStyles.infoBoxRow}>
                  <Text style={pdfStyles.infoBoxLabel}>Address:</Text>
                  <Text style={pdfStyles.infoBoxValue}>{invoice.company_address}</Text>
                </View>
              )}
              {invoice.company_gstin && (
                <View style={pdfStyles.infoBoxRow}>
                  <Text style={pdfStyles.infoBoxLabel}>GST Number:</Text>
                  <Text style={pdfStyles.infoBoxValue}>{invoice.company_gstin}</Text>
                </View>
              )}
              {invoice.company_cin && (
                <View style={pdfStyles.infoBoxRow}>
                  <Text style={pdfStyles.infoBoxLabel}>CIN Number:</Text>
                  <Text style={pdfStyles.infoBoxValue}>{invoice.company_cin}</Text>
                </View>
              )}
            </View>

            {/* Right Card: INVOICE DETAILS */}
            <View style={pdfStyles.infoBoxCard}>
              <Text style={pdfStyles.infoBoxTitle}>INVOICE &amp; CURRENCY DETAILS</Text>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Invoice Date:</Text>
                <Text style={pdfStyles.infoBoxValue}>{invoice.invoice_date}</Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Due Date:</Text>
                <Text style={pdfStyles.infoBoxValue}>{invoice.due_date}</Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Billing Currency:</Text>
                <Text style={pdfStyles.infoBoxValue}>{`${currency} (${currencySymbol})`}</Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Dual Currency:</Text>
                <Text style={pdfStyles.infoBoxValue}>{`${convertedCurrency} (${convertedCurrencySymbol})`}</Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Exchange Rate:</Text>
                <Text style={[pdfStyles.infoBoxValue, { fontSize: 7, fontWeight: 'bold' }]}>
                  {rateLabel}
                </Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Grand Total:</Text>
                <Text
                  style={[
                    pdfStyles.infoBoxValue,
                    { color: pdfColors.navy, fontWeight: 'bold' },
                  ]}
                >
                  {formatCurrencyWithSymbol(invoice.grand_total, currency)}
                </Text>
              </View>
              <View style={pdfStyles.infoBoxRow}>
                <Text style={pdfStyles.infoBoxLabel}>Dual Equivalent:</Text>
                <Text
                  style={[
                    pdfStyles.infoBoxValue,
                    { color: '#047857', fontWeight: 'bold' },
                  ]}
                >
                  {formatCurrencyWithSymbol(convertedGrandTotal, convertedCurrency)}
                </Text>
              </View>
            </View>
          </View>

          {/* Itemized Line Items Table with Dual Currency */}
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.headerColNo}>#</Text>
              <Text style={styles.headerColDesc}>Student Name / Description</Text>
              <Text style={styles.headerColQty}>Qty</Text>
              <Text style={styles.headerColRate}>Fee ({currency})</Text>
              <Text style={styles.headerColEquiv}>Equiv ({convertedCurrency})</Text>
              <Text style={styles.headerColTotal}>Total ({currency})</Text>
            </View>

            {items.map((item, idx) => {
              const itemQty = Number(item.quantity) || 1
              const itemPrice = Number(item.unit_price) || 0
              const itemLineTotal = Number(item.line_total) || itemQty * itemPrice
              const itemEquivPrice =
                Number(item.converted_unit_price) || roundCurrency(itemPrice * exchangeRate)

              return (
                <View key={item.id || idx} style={styles.tableRow}>
                  <Text style={styles.colNo}>{idx + 1}</Text>
                  <Text style={styles.colDesc}>{item.description}</Text>
                  <Text style={styles.colQty}>{item.quantity}</Text>
                  <Text style={styles.colRate}>
                    {formatCurrencyWithSymbol(itemPrice, currency)}
                  </Text>
                  <Text style={styles.colEquiv}>
                    {formatCurrencyWithSymbol(itemEquivPrice, convertedCurrency)}
                  </Text>
                  <Text style={styles.colTotal}>
                    {formatCurrencyWithSymbol(itemLineTotal, currency)}
                  </Text>
                </View>
              )
            })}
          </View>

          {/* Totals Block & Bank Remittance Section */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            {/* Totals Block (Left) */}
            <View style={styles.totalsBlock}>
              <View style={styles.totalRow}>
                <Text style={{ color: pdfColors.textMuted }}>Subtotal ({currency}):</Text>
                <Text style={{ fontWeight: 'bold', color: pdfColors.navy }}>
                  {formatCurrencyWithSymbol(invoice.subtotal, currency)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={{ color: pdfColors.textMuted, fontSize: 7 }}>
                  Subtotal Equiv ({convertedCurrency}):
                </Text>
                <Text style={{ color: '#047857', fontSize: 7 }}>
                  {formatCurrencyWithSymbol(convertedSubtotal, convertedCurrency)}
                </Text>
              </View>

              {Number(invoice.discount_amount) > 0 && (
                <>
                  <View style={styles.totalRow}>
                    <Text style={{ color: pdfColors.redText }}>Discount Amount:</Text>
                    <Text style={{ fontWeight: 'bold', color: pdfColors.redText }}>
                      - {formatCurrencyWithSymbol(invoice.discount_amount, currency)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={{ color: pdfColors.redText, fontSize: 7 }}>
                      Discount Equiv ({convertedCurrency}):
                    </Text>
                    <Text style={{ color: pdfColors.redText, fontSize: 7 }}>
                      - {formatCurrencyWithSymbol(convertedDiscountAmount, convertedCurrency)}
                    </Text>
                  </View>
                </>
              )}

              {isGstApplied ? (
                <>
                  <View style={styles.totalRow}>
                    <Text style={{ color: pdfColors.textMuted }}>
                      GST ({invoice.gst_percent}%):
                    </Text>
                    <Text style={{ fontWeight: 'bold', color: pdfColors.navy }}>
                      + {formatCurrencyWithSymbol(invoice.gst_amount, currency)}
                    </Text>
                  </View>
                  <View style={styles.totalRow}>
                    <Text style={{ color: pdfColors.textMuted, fontSize: 7 }}>
                      GST Equiv ({convertedCurrency}):
                    </Text>
                    <Text style={{ color: '#047857', fontSize: 7 }}>
                      + {formatCurrencyWithSymbol(convertedGstAmount, convertedCurrency)}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.totalRow}>
                  <Text style={{ color: pdfColors.textMuted }}>GST (Optional):</Text>
                  <Text style={{ color: pdfColors.textMuted }}>Not Applicable (0%)</Text>
                </View>
              )}

              <View style={{ borderBottomWidth: 1, borderBottomColor: pdfColors.navy, marginVertical: 3 }} />

              <View style={styles.totalRow}>
                <Text style={{ fontWeight: 'bold', fontSize: 9.5, color: pdfColors.navy }}>
                  Grand Total ({currency}):
                </Text>
                <Text style={{ fontWeight: 'bold', fontSize: 9.5, color: pdfColors.navy }}>
                  {formatCurrencyWithSymbol(invoice.grand_total, currency)}
                </Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={{ fontWeight: 'bold', fontSize: 8.5, color: '#047857' }}>
                  Equivalent ({convertedCurrency}):
                </Text>
                <Text style={{ fontWeight: 'bold', fontSize: 8.5, color: '#047857' }}>
                  {formatCurrencyWithSymbol(convertedGrandTotal, convertedCurrency)}
                </Text>
              </View>

              <View style={{ marginTop: 2 }}>
                <Text style={{ fontSize: 6.5, color: pdfColors.textMuted }}>
                  Forex Rate as of {exchangeRateDate}: {rateLabel}
                </Text>
              </View>
            </View>

            {/* Bank Remittance & Payment Terms (Right) */}
            <View style={{ width: '48%' }}>
              <PdfBankDetails
                settings={{
                  ...settings,
                  bank_branch: invoice.bank_branch || settings?.bank_branch || 'Aerocity Corporate Branch',
                }}
              />

              <View style={{ marginTop: 4 }}>
                <Text style={{ fontSize: 7.5, fontWeight: 'bold', color: pdfColors.navy, marginBottom: 2 }}>
                  Payment Terms &amp; Instructions
                </Text>
                <Text style={{ fontSize: 6.5, color: '#475569', lineHeight: 1.3 }}>
                  {invoice.notes || termsText}
                </Text>
              </View>
            </View>
          </View>

          {/* Company Invoice Footer with Onestop Aviation Logo and Computer-Generated Notice */}
          <View style={styles.footerContainer}>
            <View style={styles.footerRow}>
              {/* Left Column: Onestop Aviation Co-branding */}
              <View style={styles.onestopBlock}>
                {onestopLogoDataUri && (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={onestopLogoDataUri} style={styles.onestopLogo} />
                )}
                <Text style={styles.onestopUnitText}>
                  A Unit of Onestop Aviation Private Limited.
                </Text>
                <Text style={styles.footerContact}>
                  {phone} | {email}
                </Text>
              </View>

              {/* Right Column: Signature Not Required Computer-Generated Notice */}
              <View style={styles.signatureBlock}>
                <View style={styles.signatureBox}>
                  <Text style={styles.signatureTitle}>Signature Not Required</Text>
                  <Text style={styles.signatureSubtitle}>
                    This is a computer-generated invoice. No signature is required.
                  </Text>
                </View>
              </View>
            </View>

            <View style={pdfStyles.footerDivider} />
            <Text style={pdfStyles.zyxenTag}>Developed and designed by ZYXEN</Text>
          </View>
        </View>

        {/* Solid Bottom Edge Bar */}
        <View style={pdfStyles.bottomEdgeBar} />
      </Page>
    </Document>
  )
}
