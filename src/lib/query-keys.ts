/**
 * AVIORA Finance & Fee Management System
 * Query Key Registry (Single Source of Truth for React Query)
 *
 * All React Query queries must use these factory functions rather than inline
 * array literals. This guarantees consistent cache key structure across all views
 * and makes the targeted cache invalidation matrix reliable.
 */

export const queryKeys = {
  // Students
  students: {
    all: ['students'] as const,
    list: (filters?: Record<string, any>) => ['students', filters] as const,
    detail: (id: string) => ['student', id] as const,
    enrollments: (studentId: string) => ['student-enrollments', studentId] as const,
    filterList: ['filter-courses'] as const,
    forInvoice: ['students-for-invoice'] as const,
    forPayment: ['students-for-payment'] as const,
    forQuote: ['students-for-quote'] as const,
  },

  // Courses
  courses: {
    all: ['courses'] as const,
    detail: (id: string) => ['course', id] as const,
    filterList: ['filter-courses'] as const,
    forEnrollment: ['courses-for-enrollment'] as const,
    withTermsForQuote: ['courses-with-terms-for-quote'] as const,
  },

  // Faculty & Payroll Structure
  faculty: {
    all: ['faculty'] as const,
    detail: (id: string) => ['faculty-member', id] as const,
    salaryStructure: (id: string) => ['faculty-salary-structure', id] as const,
    effectiveStructure: (facultyId: string, effectiveDate: string) =>
      ['effective-salary-structure', facultyId, effectiveDate] as const,
    payslipHistory: (facultyId: string) => ['faculty-payslip-history', facultyId] as const,
    filterList: ['faculty-filter-list'] as const,
    forPayslip: ['faculty-for-payslip'] as const,
  },

  // Quotations
  quotations: {
    all: ['quotations'] as const,
    list: (filters?: Record<string, any>) => ['quotations', filters] as const,
    detail: (id: string) => ['quotation', id] as const,
    edit: (id: string) => ['quotation-edit', id] as const,
  },

  // Invoices
  invoices: {
    all: ['invoices'] as const,
    list: (filters?: Record<string, any>) => ['invoices', filters] as const,
    detail: (id: string) => ['invoice', id] as const,
    edit: (id: string) => ['invoice-edit', id] as const,
    summaryMetrics: ['invoice-summary-strip-metrics'] as const,
    openForStudent: (studentId: string) => ['open-invoices-for-student', studentId] as const,
    studentOutstanding: (studentId: string, excludeInvoiceId?: string) =>
      ['student-previous-outstanding', studentId, excludeInvoiceId] as const,
    prefilledForPayment: (invoiceId: string) => ['prefilled-invoice-for-payment', invoiceId] as const,
  },

  // Company Invoices (Dedicated Corporate B2B Invoices)
  companyInvoices: {
    all: ['company-invoices'] as const,
    list: (filters?: Record<string, any>) => ['company-invoices', filters] as const,
    detail: (id: string) => ['company-invoice', id] as const,
    summaryMetrics: ['company-invoices-summary-metrics'] as const,
  },

  // Payments
  payments: {
    all: ['payments'] as const,
    list: (filters?: Record<string, any>) => ['payments', filters] as const,
    detail: (id: string) => ['payment', id] as const,
  },

  // Payslips
  payslips: {
    all: ['payslips'] as const,
    list: (filters?: Record<string, any>) => ['payslips', filters] as const,
    detail: (id: string) => ['payslip', id] as const,
    duplicateCheck: (facultyId: string, month: number, year: number) =>
      ['check-duplicate-payslip', facultyId, month, year] as const,
  },

  // Dashboard Aggregates (Read RPC)
  dashboard: (period: string = 'all_time') => ['dashboard-summary', period] as const,

  // Student Ledger Statement (Read RPC)
  studentLedger: (studentId: string) => ['student-ledger', studentId] as const,

  // Company Settings
  companySettings: ['company-settings'] as const,

  // User Profile & Role
  userProfile: (userId?: string) => ['user-profile', userId || 'current'] as const,

  // Operational Expenses
  expenses: {
    all: ['expenses'] as const,
    list: (filters?: Record<string, any>) => ['expenses-list', filters] as const,
    summary: ['expenses-summary'] as const,
  },

  // Reports
  reports: {
    outstanding: (filters?: Record<string, any>) => ['report-outstanding-fees', filters] as const,
    collections: (filters?: Record<string, any>) => ['report-collections', filters] as const,
    courses: (filters?: Record<string, any>) => ['report-courses', filters] as const,
    payroll: (filters?: Record<string, any>) => ['report-payroll', filters] as const,
  },
}
