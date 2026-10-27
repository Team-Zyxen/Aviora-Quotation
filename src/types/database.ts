export type StudentStatus = 'enquiry' | 'enrolled' | 'active' | 'completed' | 'dropped'
export type EnrollmentStatus = 'active' | 'completed' | 'dropped'

export interface Student {
  id: string
  admission_no: string
  roll_number?: string | null
  name: string
  dob: string | null
  phone: string
  email: string | null
  guardian_name: string | null
  guardian_phone: string | null
  address: string | null
  admission_date: string
  status: StudentStatus
  photo_url: string | null
  created_at: string
  updated_at?: string
  created_by: string | null
  enrollments?: Enrollment[]
}

export interface Course {
  id: string
  name: string
  description: string | null
  duration_terms: number
  created_at: string
  course_terms?: CourseTerm[]
  total_fee?: number
  terms_count?: number
}

export interface CourseTerm {
  id: string
  course_id: string
  term_no: number
  term_label: string
  term_fee: number
  created_at: string
  fee_heads?: FeeHead[]
}

export interface FeeHead {
  id: string
  course_term_id: string
  label: string
  amount: number
}

export interface Faculty {
  id: string
  name: string
  designation: string | null
  department: string | null
  phone: string
  email: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_name: string | null
  date_of_joining: string | null
  active: boolean
  created_at: string
}

export interface Enrollment {
  id: string
  student_id: string
  course_id: string
  batch_year: number
  current_term: number
  status: EnrollmentStatus
  enrolled_at: string
  created_at: string
  courses?: Course
}

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'expired' | 'converted'

export interface QuotationItem {
  id?: string
  quotation_id?: string
  description: string
  quantity: number
  unit_price: number
  discount_amount: number
  line_total: number
  created_at?: string
}

export interface Quotation {
  id: string
  quote_no: string
  student_id: string | null
  student_name_snapshot?: string | null
  lead_name: string | null
  lead_phone: string | null
  lead_email: string | null
  quote_date: string
  valid_until: string | null
  status: QuotationStatus
  subtotal: number
  discount_amount: number
  gst_percent: number
  gst_amount: number
  total: number
  terms_text: string | null
  created_at: string
  created_by: string | null
  // Relations
  students?: Student | null
  quotation_items?: QuotationItem[]
}

export interface CompanySettings {
  id: string
  name?: string | null
  company_name?: string | null
  address?: string | null
  company_address?: string | null
  phone?: string | null
  company_phone?: string | null
  company_email?: string | null
  company_website?: string | null
  gstin?: string | null
  pan?: string | null
  cin_number?: string | null
  cin?: string | null
  show_gst_on_documents?: boolean
  show_cin_on_documents?: boolean
  bank_account_name?: string | null
  bank_account_number?: string | null
  bank_ifsc?: string | null
  bank_name?: string | null
  bank_branch?: string | null
  logo_url?: string | null
  signature_url?: string | null
  terms_and_conditions_text?: string | null
}

export type InvoiceStatus = 'draft' | 'sent' | 'cancelled'
export type InvoiceComputedStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled'

export interface InvoiceItem {
  id?: string
  invoice_id?: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  created_at?: string
}

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'cheque'
export type PaymentType = 'payment' | 'refund'

export interface Payment {
  id: string
  invoice_id: string
  student_id: string | null
  student_name_snapshot?: string | null
  receipt_no: string
  amount: number
  payment_date: string
  payment_mode: PaymentMode
  reference_no: string | null
  payment_type?: PaymentType
  notes: string | null
  paid_at: string
  created_at: string
  created_by?: string | null
  // Relations
  students?: Student | null
  invoices?: (Invoice & {
    enrollments?: (Enrollment & { courses?: Course }) | null
    course_terms?: CourseTerm | null
    invoice_balances?: InvoiceBalance | null
  }) | null
}

export interface InvoiceBalance {
  invoice_id: string
  grand_total: number
  amount_paid: number
  balance_due: number
  computed_status: InvoiceComputedStatus
}

export interface Invoice {
  id: string
  invoice_no: string
  fy_label: string
  student_id: string | null
  student_name_snapshot?: string | null
  enrollment_id: string | null
  course_term_id: string | null
  quotation_id: string | null
  invoice_date: string
  due_date: string
  previous_outstanding: number
  subtotal: number
  discount_amount: number
  scholarship_amount: number
  coupon_amount: number
  gst_percent: number
  gst_amount: number
  grand_total: number
  status: InvoiceStatus
  notes: string | null
  created_at: string
  created_by: string | null
  // Joined Relations
  students?: Student | null
  enrollments?: (Enrollment & { courses?: Course }) | null
  course_terms?: CourseTerm | null
  invoice_items?: InvoiceItem[]
  payments?: Payment[]
  invoice_balances?: InvoiceBalance
}

export type SupportedCurrency = 'INR' | 'USD' | 'NZD' | 'PHP'
export type CompanyInvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled'

export interface CompanyInvoiceItem {
  id?: string
  company_invoice_id?: string
  description: string
  quantity: number
  unit_price: number
  line_total: number
  currency?: SupportedCurrency
  converted_unit_price?: number
  converted_line_total?: number
  created_at?: string
}

export interface CompanyInvoice {
  id: string
  invoice_no: string
  fy_label: string
  company_name: string
  company_phone: string
  company_address?: string | null
  company_gstin?: string | null
  company_cin?: string | null
  currency: SupportedCurrency
  invoice_date: string
  due_date: string
  subtotal: number
  discount_amount: number
  gst_percent: number
  gst_amount: number
  grand_total: number
  converted_currency?: SupportedCurrency | null
  exchange_rate?: number
  exchange_rate_date?: string
  converted_subtotal?: number
  converted_discount_amount?: number
  converted_gst_amount?: number
  converted_grand_total?: number
  status: CompanyInvoiceStatus
  notes?: string | null
  created_at: string
  created_by?: string | null
  company_invoice_items?: CompanyInvoiceItem[]
}

export interface FacultySalaryStructure {
  id: string
  faculty_id: string
  basic: number
  hra: number
  other_allowances: number
  pf_deduction: number
  pt_deduction: number
  tds_deduction: number
  other_deductions: number
  effective_from: string
  created_at: string
}

export interface PayslipStructureSnapshot {
  basic: number
  hra: number
  other_allowances: number
  pf_deduction: number
  pt_deduction: number
  tds_deduction: number
  other_deductions: number
  effective_from: string
  gross_pay: number
  total_deductions: number
  net_pay: number
}

export interface Payslip {
  id: string
  payslip_no: string
  faculty_id: string
  month: number
  year: number
  gross_pay: number
  total_deductions: number
  net_pay: number
  salary_structure_snapshot: PayslipStructureSnapshot
  generated_at: string
  created_by?: string | null
  // Relations
  faculty?: Faculty | null
}
