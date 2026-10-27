import { Suspense } from 'react'
import { NewInvoicePageClient } from './NewInvoicePageClient'
import { Skeleton } from '@/components/ui/Skeleton'

export const metadata = {
  title: 'Create Invoice | Aviora Finance',
  description: 'Generate itemized term billing, student tax invoices, or corporate company invoices.',
}

export default async function NewInvoicePage(props: {
  searchParams: Promise<{ quotation_id?: string; type?: string }>
}) {
  const searchParams = await props.searchParams
  return (
    <div className="max-w-[1800px] w-full mx-auto py-2 sm:py-4">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <NewInvoicePageClient
          initialType={searchParams.type || null}
          prefillQuotationId={searchParams.quotation_id || null}
        />
      </Suspense>
    </div>
  )
}
