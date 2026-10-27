import { Suspense } from 'react'
import { CompanyInvoiceDetail } from './CompanyInvoiceDetail'
import { Skeleton } from '@/components/ui/Skeleton'

export const metadata = {
  title: 'Company Invoice Details | Aviora Finance',
  description: 'View corporate company invoice details, line items, and generate branded PDF documents.',
}

export default function CompanyInvoiceDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full max-w-5xl mx-auto rounded-xl" />}>
      <CompanyInvoiceDetail />
    </Suspense>
  )
}
