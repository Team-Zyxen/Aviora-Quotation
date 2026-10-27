import { Suspense } from 'react'
import { EditCompanyInvoiceClient } from './EditCompanyInvoiceClient'
import { Skeleton } from '@/components/ui/Skeleton'

export const metadata = {
  title: 'Edit Company Invoice | Aviora Finance',
  description: 'Modify corporate company invoice details, line items, and currency amounts.',
}

export default function EditCompanyInvoicePage() {
  return (
    <div className="max-w-[1800px] w-full mx-auto py-2 sm:py-4">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <EditCompanyInvoiceClient />
      </Suspense>
    </div>
  )
}
