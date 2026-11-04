import type { Metadata } from 'next'
import { Suspense } from 'react'
import { bodyCell, headCell, OrderLink, tableRow } from '@/components/order-cells'
import { PageTitle } from '@/components/page-title'
import { panel, TableSkeleton } from '@/components/skeleton'
import { StatusBadge } from '@/components/status-badge'
import { currentUser } from '@/server/auth'
import { date, loadCustomer, loadRecentOrderRefs, money } from '@/server/data'

export const metadata: Metadata = { title: 'Order feed' }

type Ref = Awaited<ReturnType<typeof loadRecentOrderRefs>>[number]

async function Row({ order }: { order: Ref }) {
  const customer = await loadCustomer(order.customerId)
  return (
    <tr className={tableRow}>
      <td className={bodyCell}>
        <OrderLink id={order.id} />
      </td>
      <td className={bodyCell}>{customer.name}</td>
      <td className={`${bodyCell} text-muted`}>{customer.city}</td>
      <td className={bodyCell}>
        <StatusBadge status={order.status} />
      </td>
      <td className={`${bodyCell} text-right tabular-nums`}>{money(order.totalCents)}</td>
      <td className={`${bodyCell} whitespace-nowrap text-muted tabular-nums`}>
        {date(order.createdAt)}
      </td>
    </tr>
  )
}

async function Rows() {
  await currentUser()
  const orders = await loadRecentOrderRefs(50)
  return (
    <div className={`overflow-x-auto ${panel}`}>
      <table className="w-full min-w-[42rem] border-collapse">
        <thead className="bg-tint">
          <tr className="border-b border-line">
            {['Order', 'Customer', 'City', 'Status'].map((h) => (
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
            <Row key={order.id} order={order} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PerRow() {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle note="The last 50 orders, each with who placed it.">Order feed</PageTitle>
      <Suspense fallback={<TableSkeleton rows={24} />}>
        <Rows />
      </Suspense>
    </div>
  )
}
