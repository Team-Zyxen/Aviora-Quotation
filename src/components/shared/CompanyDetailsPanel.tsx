'use client'

import React, { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Building2, ChevronDown, ChevronUp, FileText, Landmark, ShieldCheck } from 'lucide-react'

export interface CompanyDetailsState {
  company_name: string
  company_email: string
  company_phone: string
  company_address: string
  gstin: string
  cin: string
  show_gst_on_documents: boolean
  show_cin_on_documents: boolean
  bank_name: string
  bank_account_name: string
  bank_account_number: string
  bank_ifsc: string
  bank_branch: string
  terms_and_conditions_text: string
}

export interface CompanyDetailsChangePayload {
  values: CompanyDetailsState
  isDirty: boolean
}

export const defaultCompanyDetails: CompanyDetailsState = {
  company_name: 'AVIORA AVIATION ACADEMY',
  company_email: 'Fly@avioraacademy.com',
  company_phone: '+91 63093 42416',
  company_address: 'Block No 5, 8-5-255/66, Inner Ring Road, Defence Colony, Hyderabad, TG, 500079',
  gstin: '0987654321417136638223',
  cin: 'U85500TS2025PTC198846',
  show_gst_on_documents: false,
  show_cin_on_documents: false,
  bank_name: 'HDFC Bank Ltd',
  bank_account_name: 'Aviora Aviation Academy Pvt Ltd',
  bank_account_number: '50200012345678',
  bank_ifsc: 'HDFC0000123',
  bank_branch: 'Aerocity Corporate Branch',
  terms_and_conditions_text:
    '1. Fees quoted are subject to seat availability at enrollment.\n2. Applicable taxes (GST) are levied per Government of India guidelines.\n3. Installment schedules will be governed by admission agreements.',
}

export async function saveCompanySettings(
  supabase: ReturnType<typeof createClient>,
  values: CompanyDetailsState
) {
  const { data: existing, error: fetchErr } = await supabase
    .from('company_settings')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (fetchErr) {
    console.error('saveCompanySettings fetch error:', {
      message: fetchErr.message,
      code: fetchErr.code,
      details: fetchErr.details,
      hint: fetchErr.hint,
    })
    throw new Error(fetchErr.message || 'Failed to fetch company_settings row')
  }

  // Exact DB column mappings for public.company_settings table
  const payload = {
    name: values.company_name || null,
    address: values.company_address || null,
    phone: values.company_phone || null,
    gstin: values.gstin || null,
    cin_number: values.cin || null,
    show_gst_on_documents: !!values.show_gst_on_documents,
    show_cin_on_documents: !!values.show_cin_on_documents,
    bank_name: values.bank_name || null,
    bank_account_name: values.bank_account_name || null,
    bank_account_number: values.bank_account_number || null,
    bank_ifsc: values.bank_ifsc || null,
    bank_branch: values.bank_branch || null,
    terms_and_conditions_text: values.terms_and_conditions_text || null,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { error: updateErr } = await supabase
      .from('company_settings')
      .update(payload)
      .eq('id', existing.id)

    if (updateErr) {
      console.error('saveCompanySettings update error:', {
        message: updateErr.message,
        code: updateErr.code,
        details: updateErr.details,
        hint: updateErr.hint,
      })
      throw new Error(updateErr.message || 'Failed to update company settings')
    }
  } else {
    const { error: insertErr } = await supabase
      .from('company_settings')
      .insert([payload])

    if (insertErr) {
      console.error('saveCompanySettings insert error:', {
        message: insertErr.message,
        code: insertErr.code,
        details: insertErr.details,
        hint: insertErr.hint,
      })
      throw new Error(insertErr.message || 'Failed to insert company settings')
    }
  }
}

interface CompanyDetailsPanelProps {
  onChange?: (payload: CompanyDetailsChangePayload) => void
  initialCollapsed?: boolean
  initialValues?: Partial<CompanyDetailsState>
}

export function CompanyDetailsPanel({
  onChange,
  initialCollapsed = true,
  initialValues,
}: CompanyDetailsPanelProps) {
  const supabase = createClient()
  const [isExpanded, setIsExpanded] = useState(!initialCollapsed)
  const [formState, setFormState] = useState<CompanyDetailsState>(() => ({
    ...defaultCompanyDetails,
    ...(initialValues || {}),
  }))

  const onChangeRef = React.useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const hasHydratedRef = React.useRef(false)
  const initialBankBranch = initialValues?.bank_branch

  // Fetch current company settings
  const { data: settingsData } = useQuery({
    queryKey: ['company_settings_panel'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_settings')
        .select('*')
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  // Hydrate state once when settings load
  useEffect(() => {
    if (settingsData && !hasHydratedRef.current) {
      hasHydratedRef.current = true
      const hydrated: CompanyDetailsState = {
        company_name: initialValues?.company_name || settingsData.name || settingsData.company_name || defaultCompanyDetails.company_name,
        company_email: initialValues?.company_email || settingsData.company_email || defaultCompanyDetails.company_email,
        company_phone: initialValues?.company_phone || settingsData.phone || settingsData.company_phone || defaultCompanyDetails.company_phone,
        company_address: initialValues?.company_address || settingsData.address || settingsData.company_address || defaultCompanyDetails.company_address,
        gstin: initialValues?.gstin || settingsData.gstin || defaultCompanyDetails.gstin,
        cin: initialValues?.cin || settingsData.cin_number || settingsData.cin || defaultCompanyDetails.cin,
        show_gst_on_documents: initialValues?.show_gst_on_documents ?? settingsData.show_gst_on_documents ?? false,
        show_cin_on_documents: initialValues?.show_cin_on_documents ?? settingsData.show_cin_on_documents ?? false,
        bank_name: initialValues?.bank_name || settingsData.bank_name || defaultCompanyDetails.bank_name,
        bank_account_name: initialValues?.bank_account_name || settingsData.bank_account_name || defaultCompanyDetails.bank_account_name,
        bank_account_number: initialValues?.bank_account_number || settingsData.bank_account_number || defaultCompanyDetails.bank_account_number,
        bank_ifsc: initialValues?.bank_ifsc || settingsData.bank_ifsc || defaultCompanyDetails.bank_ifsc,
        bank_branch: initialBankBranch || settingsData.bank_branch || defaultCompanyDetails.bank_branch,
        terms_and_conditions_text:
          initialValues?.terms_and_conditions_text || settingsData.terms_and_conditions_text || defaultCompanyDetails.terms_and_conditions_text,
      }
      setFormState(hydrated)
      onChangeRef.current?.({ values: hydrated, isDirty: false })
    }
  }, [settingsData, initialBankBranch])

  const updateField = <K extends keyof CompanyDetailsState>(field: K, value: CompanyDetailsState[K]) => {
    const updated = { ...formState, [field]: value }
    setFormState(updated)
    onChangeRef.current?.({ values: updated, isDirty: true })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden transition-all">
      {/* Header Accordion Bar */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-3.5 bg-slate-50/70 hover:bg-slate-100/80 flex items-center justify-between transition-colors cursor-pointer text-left"
      >
        <div className="flex items-center gap-2.5">
          <Building2 className="w-4 h-4 text-navy-800" />
          <span className="text-sm font-bold text-gray-900">
            Company &amp; Document Details
          </span>
          <span className="text-xs text-gray-500 font-normal">
            (Editable bank details, header address, GST/CIN visibility &amp; PDF terms)
          </span>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-2xs font-semibold text-gray-500 uppercase tracking-wider">
            {isExpanded ? 'Collapse' : 'Expand / Edit'}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable Form Body */}
      {isExpanded && (
        <div className="p-5 border-t border-gray-200/80 space-y-5 bg-white">
          {/* Header & Registration Section */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-accent" />
              Company Header &amp; Tax Registration
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formState.company_name}
                  onChange={(e) => updateField('company_name', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Company Address Line
                </label>
                <input
                  type="text"
                  value={formState.company_address}
                  onChange={(e) => updateField('company_address', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="text"
                  value={formState.company_phone}
                  onChange={(e) => updateField('company_phone', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formState.company_email}
                  onChange={(e) => updateField('company_email', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  GSTIN Number
                </label>
                <input
                  type="text"
                  value={formState.gstin}
                  onChange={(e) => updateField('gstin', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  CIN Number
                </label>
                <input
                  type="text"
                  value={formState.cin}
                  onChange={(e) => updateField('cin', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>
            </div>

            {/* Tax Visibility Checkboxes */}
            <div className="pt-2 flex flex-wrap items-center gap-6 bg-slate-50 p-3 rounded-lg border border-slate-200">
              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={formState.show_gst_on_documents}
                  onChange={(e) => updateField('show_gst_on_documents', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-accent cursor-pointer"
                />
                Show GST Number on document
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-800">
                <input
                  type="checkbox"
                  checked={formState.show_cin_on_documents}
                  onChange={(e) => updateField('show_cin_on_documents', e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-navy-800 focus:ring-accent cursor-pointer"
                />
                Show CIN Number on document
              </label>
            </div>
          </div>

          {/* Bank & Remittance Section */}
          <div className="space-y-3 pt-3 border-t border-gray-100">
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
              <Landmark className="w-3.5 h-3.5 text-accent" />
              Remittance &amp; Bank Details
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Beneficiary Name
                </label>
                <input
                  type="text"
                  value={formState.bank_account_name}
                  onChange={(e) => updateField('bank_account_name', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={formState.bank_name}
                  onChange={(e) => updateField('bank_name', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formState.bank_account_number}
                  onChange={(e) => updateField('bank_account_number', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  IFSC Code
                </label>
                <input
                  type="text"
                  value={formState.bank_ifsc}
                  onChange={(e) => updateField('bank_ifsc', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Branch Location
                </label>
                <input
                  type="text"
                  value={formState.bank_branch}
                  onChange={(e) => updateField('bank_branch', e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent"
                />
              </div>
            </div>
          </div>

          {/* Terms & Instructions Section */}
          <div className="space-y-2 pt-3 border-t border-gray-100">
            <h4 className="text-xs font-bold text-navy-900 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-accent" />
              Document Terms &amp; Instructions
            </h4>
            <textarea
              rows={3}
              value={formState.terms_and_conditions_text}
              onChange={(e) => updateField('terms_and_conditions_text', e.target.value)}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-accent focus:border-accent font-mono"
            />
          </div>
        </div>
      )}
    </div>
  )
}
