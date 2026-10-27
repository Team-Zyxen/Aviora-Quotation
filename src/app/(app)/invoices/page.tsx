import { Suspense } from 'react'
import { InvoicesPageClient } from './InvoicesPageClient'
import { Skeleton } from '@/components/ui/Skeleton'

export const metadata = {
  title: 'Invoices & Corporate Billing | Aviora Finance',
  description: 'Manage academic fee invoices, student ledgers, and corporate company invoices.',
}

export default async function InvoicesPage(props: {
  searchParams: Promise<{ tab?: string }>
}) {
  const searchParams = await props.searchParams
  return (
    <div className="max-w-[1800px] w-full mx-auto py-2 sm:py-4">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <InvoicesPageClient initialTab={searchParams.tab || null} />
      </Suspense>
    </div>
  )
}
