import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { headCell, OrderCells, tableRow } from '@/components/order-cells'
import { PageTitle } from '@/components/page-title'
import { RevenueChart } from '@/components/revenue-chart'
import { panel, Skeleton, TableSkeleton } from '@/components/skeleton'
import { currentUser } from '@/server/auth'
import { loadLatestOrders, loadRevenueByMonth, loadStats } from '@/server/data'

export const metadata: Metadata = { title: 'Overview' }

async function Stats() {
  await currentUser()
  const stats = await loadStats()
  const tiles = [
    ['Revenue', stats.revenue],
    ['Orders', stats.orders],
    ['Customers', stats.customers],
    ['Refunded', stats.refunded],
  ]
  return tiles.map(([label, value]) => (
    <div key={label} className={`${panel} min-w-0 p-4`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold sm:text-2xl tracking-tight tabular-nums">{value}</p>
    </div>
  ))
}

async function Revenue() {
  await currentUser()
  return <RevenueChart months={await loadRevenueByMonth()} />
}

async function Latest() {
  await currentUser()
  const orders = await loadLatestOrders(10)
  return (
    <div className={`overflow-x-auto ${panel}`}>
      <table className="w-full min-w-[36rem] border-collapse">
        <thead className="bg-tint">
          <tr className="border-b border-line">
            {['Order', 'Customer', 'Status'].map((h) => (
              <th key={h} scope="col" className={headCell}>
                {h}
              </th>
            ))}
            <th scope="col" className={`${headCell} text-right`}>
              Total
            </th>
            <th scope="col" className={headCell}>
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className={tableRow}>
              <OrderCells order={order} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Overview() {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle note="How the shop is doing, all time.">Overview</PageTitle>
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Suspense
          fallback={[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[5.625rem]" />
          ))}
        >
          <Stats />
        </Suspense>
      </section>
      <section aria-labelledby="revenue" className={`${panel} p-5`}>
        <h2 id="revenue" className="mb-4 font-semibold">
          Revenue by month
        </h2>
        <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-tint" />}>
          <Revenue />
        </Suspense>
      </section>
      <section aria-labelledby="latest">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="latest" className="font-semibold">
            Latest orders
          </h2>
          <Link href="/admin/orders" className="text-sm font-medium text-accent hover:underline">
            All orders
          </Link>
        </div>
        <Suspense fallback={<TableSkeleton rows={10} />}>
          <Latest />
        </Suspense>
      </section>
    </div>
  )
}
