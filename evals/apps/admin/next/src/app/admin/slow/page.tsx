import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Counter } from '@/components/counter'
import { PageTitle } from '@/components/page-title'
import { panel } from '@/components/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { currentUser } from '@/server/auth'
import { loadSlowReport } from '@/server/data'

export const metadata: Metadata = { title: 'Report' }

async function Report() {
  await currentUser()
  const counts = await loadSlowReport()
  return (
    <ul>
      {counts.map(({ status, orders }) => (
        <li key={status} className="flex items-center justify-between gap-4 border-b border-line py-2 text-sm last:border-0">
          <StatusBadge status={status} />
          <span className="tabular-nums">{orders.toLocaleString('en-US')}</span>
        </li>
      ))}
    </ul>
  )
}

function ReportSkeleton() {
  return <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-tint" />
}

export default function Slow() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle note="The full report takes a moment; the page doesn't wait for it.">Report</PageTitle>
        <Counter />
      </header>
      <section aria-labelledby="report" className={`${panel} p-5`}>
        <h2 id="report" className="mb-3 font-semibold">Report</h2>
        <Suspense fallback={<ReportSkeleton />}><Report /></Suspense>
      </section>
    </div>
  )
}
