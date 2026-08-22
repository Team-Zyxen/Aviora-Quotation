import React from 'react'
import { Text, View, StyleSheet, Image, Font, Svg, Polygon } from '@react-pdf/renderer'
import path from 'path'
import fs from 'fs'
import type { CompanySettings } from '@/types/database'

// Register Noto Sans locally so ₹ (U+20B9) renders correctly in all PDFs.
Font.register({
  family: 'NotoSans',
  fonts: [
    {
      src: path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Regular.ttf'),
      fontWeight: 'normal',
    },
    {
      src: path.join(process.cwd(), 'public', 'fonts', 'NotoSans-Bold.ttf'),
      fontWeight: 'bold',
    },
  ],
})

// Visual Design Tokens matching attached reference image
export const pdfColors = {
  bgCream: '#FAF6EF',       // Warm cream/ivory background tone
  navy: '#0A1E3F',          // Deep navy primary tone
  gold: '#C5A059',          // Rich gold/tan accent tone
  goldLight: '#F1E7DA',     // Light tan box fill for bank remittance
  goldBorder: '#C5A059',    // Rounded info box gold border
  redText: '#991B1B',       // Maroon/red for balance due highlight
  textDark: '#0A1E3F',      // Main dark navy body text
  textMuted: '#64748B',     // Muted gray labels
  borderGray: '#E2E8F0',    // Table row borders
  lineDivider: '#B0B0B0',   // Main horizontal dividers
}

export const pdfStyles = StyleSheet.create({
  page: {
    fontFamily: 'NotoSans',
    fontSize: 8.5,
    color: pdfColors.textDark,
    backgroundColor: pdfColors.bgCream,
    padding: 0,
    flexDirection: 'column',
    minHeight: '100%',
  },
  topEdgeBar: {
    height: 6,
    backgroundColor: pdfColors.gold,
    width: '100%',
  },
  bottomEdgeBar: {
    height: 6,
    backgroundColor: pdfColors.navy,
    width: '100%',
  },
  bodyContent: {
    paddingHorizontal: 36,
    paddingTop: 20,
    paddingBottom: 16,
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    marginBottom: 8,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 14,
    justifyContent: 'center',
  },
  headerRight: {
    width: 120,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  companyLogo: {
    width: 115,
    height: 52,
    objectFit: 'contain',
  },
  companyAddress: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: pdfColors.navy,
    lineHeight: 1.4,
  },
  taxLine: {
    fontSize: 9,
    fontWeight: 'bold',
    color: pdfColors.navy,
    marginTop: 4,
  },
  headerDivider: {
    borderBottomWidth: 0.8,
    borderBottomColor: pdfColors.lineDivider,
    marginBottom: 12,
  },
  docTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: pdfColors.navy,
    letterSpacing: 1,
    marginBottom: 10,
  },
  ribbonContainer: {
    flexDirection: 'row',
    height: 22,
    marginBottom: 14,
    width: '100%',
  },
  ribbonLeft: {
    backgroundColor: pdfColors.gold,
    paddingHorizontal: 12,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  ribbonLeftText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  ribbonRight: {
    backgroundColor: pdfColors.navy,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    flex: 1,
  },
  ribbonRightText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 8.5,
    letterSpacing: 0.5,
  },
  infoBoxesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  infoBoxCard: {
    width: '48.5%',
    borderWidth: 1,
    borderColor: pdfColors.goldBorder,
    borderRadius: 8,
    padding: 10,
    backgroundColor: pdfColors.bgCream,
  },
  infoBoxTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: pdfColors.navy,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  infoBoxRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  infoBoxLabel: {
    width: '40%',
    fontSize: 8,
    color: pdfColors.textMuted,
  },
  infoBoxValue: {
    width: '60%',
    fontSize: 8,
    fontWeight: 'bold',
    color: pdfColors.navy,
  },
  bankBlock: {
    marginBottom: 8,
  },
  footerContainer: {
    marginTop: 'auto',
    paddingTop: 10,
  },
  footerDivider: {
    borderTopWidth: 0.8,
    borderTopColor: pdfColors.lineDivider,
    marginTop: 10,
    marginBottom: 6,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  footerLeft: {
    width: '62%',
  },
  footerNote: {
    fontSize: 8.5,
    color: '#475569',
    lineHeight: 1.35,
  },
  footerContact: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: pdfColors.navy,
    marginTop: 4,
  },
  footerRight: {
    width: '35%',
    alignItems: 'flex-end',
  },
  signatureLine: {
    width: 160,
    borderTopWidth: 0.8,
    borderTopColor: pdfColors.navy,
    paddingTop: 4,
    alignItems: 'center',
  },
  signatoryTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: pdfColors.navy,
  },
  signatorySubtitle: {
    fontSize: 8,
    color: pdfColors.navy,
  },
  zyxenTag: {
    fontSize: 7.5,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 2,
  },
})

let cachedLogoDataUri: string | null = null

function getLogoDataUri(): string | null {
  if (cachedLogoDataUri) return cachedLogoDataUri
  try {
    const logoPath = path.join(process.cwd(), 'public', 'aviora-logo.png')
    if (fs.existsSync(logoPath)) {
      const buffer = fs.readFileSync(logoPath)
      cachedLogoDataUri = `data:image/png;base64,${buffer.toString('base64')}`
      return cachedLogoDataUri
    }
  } catch (err) {
    console.error('Error reading logo file for PDF:', err)
  }
  return null
}

// Header Component matching exact reference design with dynamic GST/CIN space allocation
export function PdfHeader({ settings }: { settings?: Partial<CompanySettings> | null }) {
  const address =
    settings?.address ||
    settings?.company_address ||
    'Block No 5, 8-5-255/66, Inner Ring Road, Defence Colony, Hyderabad, TG, 500079'
  const cin = settings?.cin_number || settings?.cin || ''
  const gstin = settings?.gstin || ''

  // Respect exact checkbox directives & string presence
  const showCin = settings?.show_cin_on_documents !== false && !!cin
  const showGst = settings?.show_gst_on_documents !== false && !!gstin
  const hasTaxDetails = showCin || showGst

  const logoDataUri = getLogoDataUri()

  return (
    <View>
      <View style={pdfStyles.headerContainer}>
        <View style={[pdfStyles.headerLeft, { minHeight: 55, justifyContent: 'center' }]}>
          <Text style={hasTaxDetails ? pdfStyles.companyAddress : [pdfStyles.companyAddress, { fontSize: 10.5, lineHeight: 1.4 }]}>
            {address}
          </Text>
          {showCin && <Text style={pdfStyles.taxLine}>CIN No: {cin}</Text>}
          {showGst && <Text style={pdfStyles.taxLine}>GST No: {gstin}</Text>}
        </View>
        <View style={pdfStyles.headerRight}>
          {logoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoDataUri} style={pdfStyles.companyLogo} />
          ) : (
            <View style={{ backgroundColor: pdfColors.navy, padding: 8, borderRadius: 4 }}>
              <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 }}>AVIORA</Text>
            </View>
          )}
        </View>
      </View>
      <View style={pdfStyles.headerDivider} />
    </View>
  )
}

// Two-tone angled Status Ribbon component
export function PdfStatusRibbon({
  title = 'OFFICIAL TAX INVOICE',
  subtitle = '',
}: {
  title?: string
  subtitle?: string
}) {
  return (
    <View style={pdfStyles.ribbonContainer}>
      <View style={pdfStyles.ribbonLeft}>
        <Text style={pdfStyles.ribbonLeftText}>{title}</Text>
      </View>
      <Svg width="14" height="22" style={{ margin: 0, padding: 0 }}>
        <Polygon points="0,0 14,0 0,22" fill={pdfColors.gold} />
        <Polygon points="14,0 14,22 0,22" fill={pdfColors.navy} />
      </Svg>
      <View style={pdfStyles.ribbonRight}>
        <Text style={pdfStyles.ribbonRightText}>{subtitle}</Text>
      </View>
    </View>
  )
}

// Remittance & Bank Details Box
export function PdfBankDetails({ settings }: { settings?: Partial<CompanySettings> | null }) {
  const bankName = settings?.bank_name || 'HDFC Bank Ltd'
  const accName = settings?.bank_account_name || 'Aviora Aviation Academy Pvt Ltd'
  const accNo = settings?.bank_account_number || '50200012345678'
  const ifsc = settings?.bank_ifsc || 'HDFC0000123'
  const branch = settings?.bank_branch || 'Aerocity Corporate Branch'

  return (
    <View style={pdfStyles.bankBlock}>
      <Text style={{ fontSize: 8.5, fontWeight: 'bold', color: pdfColors.navy, marginBottom: 4 }}>
        REMITTANCE &amp; BANK DETAILS
      </Text>
      <View
        style={{
          backgroundColor: pdfColors.goldLight,
          padding: 8,
          borderRadius: 6,
        }}
      >
        <View style={pdfStyles.infoBoxRow}>
          <Text style={pdfStyles.infoBoxLabel}>Beneficiary:</Text>
          <Text style={pdfStyles.infoBoxValue}>{accName}</Text>
        </View>
        <View style={pdfStyles.infoBoxRow}>
          <Text style={pdfStyles.infoBoxLabel}>Bank Name:</Text>
          <Text style={pdfStyles.infoBoxValue}>{bankName}</Text>
        </View>
        <View style={pdfStyles.infoBoxRow}>
          <Text style={pdfStyles.infoBoxLabel}>Account No:</Text>
          <Text style={pdfStyles.infoBoxValue}>{accNo}</Text>
        </View>
        <View style={pdfStyles.infoBoxRow}>
          <Text style={pdfStyles.infoBoxLabel}>IFSC Code:</Text>
          <Text style={pdfStyles.infoBoxValue}>{ifsc}</Text>
        </View>
        <View style={pdfStyles.infoBoxRow}>
          <Text style={pdfStyles.infoBoxLabel}>Branch:</Text>
          <Text style={pdfStyles.infoBoxValue}>{branch}</Text>
        </View>
      </View>
    </View>
  )
}

// Shared Footer Component with ZYXEN Tag
export function PdfFooter({
  settings,
  note = 'This is a computer-generated official document. Please quote the reference number in all communications.',
}: {
  settings?: Partial<CompanySettings> | null
  note?: string
}) {
  const phone = settings?.phone || settings?.company_phone || '+91 63093 42416'
  const email = settings?.company_email || 'Fly@avioraacademy.com'

  return (
    <View style={pdfStyles.footerContainer}>
      <View style={pdfStyles.footerRow}>
        <View style={pdfStyles.footerLeft}>
          <Text style={pdfStyles.footerNote}>{note}</Text>
          <Text style={pdfStyles.footerContact}>
            {phone} | {email}
          </Text>
        </View>
        <View style={pdfStyles.footerRight}>
          <View style={pdfStyles.signatureLine}>
            <Text style={pdfStyles.signatoryTitle}>Authorized Signatory</Text>
            <Text style={pdfStyles.signatorySubtitle}>
              For Aviora Aviation Academy
            </Text>
          </View>
        </View>
      </View>
      <View style={pdfStyles.footerDivider} />
      <Text style={pdfStyles.zyxenTag}>Developed and designed by ZYXEN</Text>
    </View>
  )
}

// Alias export for backward compatibility
export const PdfSignatureFooter = PdfFooter
