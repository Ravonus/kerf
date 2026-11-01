import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { FiltersSkeleton, OrderFilters } from '@/components/order-filters'
import { OrdersTable, type SortColumn } from '@/components/orders-table'
import { PageTitle } from '@/components/page-title'
import { panel, TableSkeleton } from '@/components/skeleton'
import { type OrdersQuery, ordersHref, pageSize, parseQuery, type SortKey } from '@/lib/orders'
import { currentUser } from '@/server/auth'
import { loadOrders } from '@/server/data'

export const metadata: Metadata = { title: 'Orders' }

type Search = Promise<Record<string, string | string[] | undefined>>

const columns: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'id', label: 'Order' },
  { key: 'customer', label: 'Customer' },
  { key: 'status', label: 'Status' },
  { key: 'total', label: 'Total', right: true },
  { key: 'created', label: 'Date' },
]

function sortColumn(column: (typeof columns)[number], query: OrdersQuery): SortColumn {
  const dir = query.sort === column.key && query.dir === 'asc' ? 'desc' : 'asc'
  return { ...column, href: ordersHref({ ...query, sort: column.key, dir, page: 1 }) }
}

const pager = 'rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium'

function Pager({ query, total }: { query: OrdersQuery; total: number }) {
  const first = total ? (query.page - 1) * pageSize + 1 : 0, last = Math.min(query.page * pageSize, total)
  return (
    <div className="mt-3 flex items-center justify-between gap-4">
      <p className="text-sm text-muted tabular-nums">{first.toLocaleString('en-US')}–{last.toLocaleString('en-US')} of {total.toLocaleString('en-US')}</p>
      <div className="flex gap-2">
        {query.page > 1
          ? <Link href={ordersHref({ ...query, page: query.page - 1 })} className={`${pager} hover:bg-tint`}>Previous</Link>
          : <span aria-disabled="true" className={`${pager} text-faint`}>Previous</span>}
        {last < total
          ? <Link href={ordersHref({ ...query, page: query.page + 1 })} className={`${pager} hover:bg-tint`}>Next</Link>
          : <span aria-disabled="true" className={`${pager} text-faint`}>Next</span>}
      </div>
    </div>
  )
}

async function Orders({ searchParams }: { searchParams: Search }) {
  const [, raw] = await Promise.all([currentUser(), searchParams])
  const query = parseQuery(raw)
  const { rows, total } = await loadOrders(query)
  if (!rows.length) return <p className={`${panel} px-4 py-16 text-center text-muted`}>No orders match that.</p>
  return (
    <>
      {/* key: a selection belongs to the rows it was made on */}
      <OrdersTable key={ordersHref(query)} rows={rows} columns={columns.map(c => sortColumn(c, query))} sort={query.sort} dir={query.dir} />
      <Pager query={query} total={total} />
    </>
  )
}

export default function OrdersPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="flex flex-col gap-5">
      <PageTitle note="Every order, newest first.">Orders</PageTitle>
      <Suspense fallback={<FiltersSkeleton />}>
        <OrderFilters />
      </Suspense>
      <Suspense fallback={<div className="mt-12"><TableSkeleton rows={24} /></div>}>
        <Orders searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
