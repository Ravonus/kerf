import { type ReactNode, Suspense } from 'react'
import { PageTitle } from '@/components/page-title'
import { StatusBadge } from '@/components/status-badge'
import { currentUser } from '@/server/auth'
import { loadStatusCounts } from '@/server/data'

async function StatusSummary() {
  await currentUser()
  const counts = await loadStatusCounts()
  return counts.map(({ status, orders }) => (
    <span key={status} className="flex items-center gap-1.5 text-sm tabular-nums"><StatusBadge status={status} /> {orders.toLocaleString('en-US')}</span>
  ))
}

export default function NestedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle note="Where orders stand, where they go, and what's in them.">Insights</PageTitle>
      <div className="flex min-h-6 flex-wrap gap-4">
        <Suspense><StatusSummary /></Suspense>
      </div>
      {children}
    </div>
  )
}
