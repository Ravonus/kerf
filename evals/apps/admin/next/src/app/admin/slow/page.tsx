import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Counter } from '@/components/counter'
import { bodyCell, headCell, tableRow } from '@/components/order-cells'
import { PageTitle } from '@/components/page-title'
import { panel } from '@/components/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { currentUser } from '@/server/auth'
import { loadSlowReport, money } from '@/server/data'

export const metadata: Metadata = { title: 'Year report' }

async function Report() {
  await currentUser()
  const lines = await loadSlowReport()
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className={headCell}>
            Status
          </th>
          <th scope="col" className={`${headCell} text-right`}>
            Orders
          </th>
          <th scope="col" className={`${headCell} text-right`}>
            Revenue
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => (
          <tr key={line.status} className={tableRow}>
            <td className={bodyCell}>
              <StatusBadge status={line.status} />
            </td>
            <td className={`${bodyCell} text-right tabular-nums`}>
              {line.orders.toLocaleString('en-US')}
            </td>
            <td className={`${bodyCell} text-right tabular-nums`}>{money(line.revenue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReportSkeleton() {
  return <div aria-hidden="true" className="h-40 animate-pulse rounded-lg bg-tint" />
}

export default function Slow() {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle note="The books take a moment to add up. Keep working: the page is yours while they do.">
          Year report
        </PageTitle>
        <Counter />
      </header>
      <section aria-labelledby="report" className={`${panel} p-5`}>
        <h2 id="report" className="mb-3 font-semibold">
          Report
        </h2>
        <Suspense fallback={<ReportSkeleton />}>
          <Report />
        </Suspense>
      </section>
    </div>
  )
}
