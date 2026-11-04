import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { bodyCell, headCell, tableRow } from '@/components/order-cells'
import { panel, Skeleton, TableSkeleton } from '@/components/skeleton'
import { StatusSelect } from '@/components/status-select'
import { currentUser } from '@/server/auth'
import { date, loadOrder, money } from '@/server/data'

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> => ({ title: `Order #${(await params).id}` })

async function Order({ params }: { params: Promise<{ id: string }> }) {
  const [, { id: raw }] = await Promise.all([currentUser(), params])
  const id = Number(raw)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) notFound()
  const order = await loadOrder(id)
  if (!order) notFound()
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight tabular-nums">Order #{order.id}</h1>
        <p className="mt-1 text-sm text-muted tabular-nums">
          {date(order.createdAt)} · {money(order.totalCents)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <section aria-labelledby="customer" className={`${panel} p-5`}>
          <h2 id="customer" className="text-sm text-muted">
            Customer
          </h2>
          <p className="mt-1 font-semibold">{order.customer}</p>
          <p className="text-sm text-muted">
            {order.email} · {order.city}
          </p>
        </section>
        <section aria-labelledby="fulfilment" className={`${panel} p-5`}>
          <h2 id="fulfilment" className="mb-2 text-sm text-muted">
            Fulfilment
          </h2>
          <StatusSelect id={order.id} status={order.status} />
        </section>
      </div>
      <section aria-labelledby="items">
        <h2 id="items" className="mb-3 font-semibold">
          Items
        </h2>
        <div className={`overflow-x-auto ${panel}`}>
          <table className="w-full min-w-[28rem] border-collapse">
            <thead className="bg-tint">
              <tr className="border-b border-line">
                <th scope="col" className={headCell}>
                  Product
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  Qty
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  Price
                </th>
                <th scope="col" className={`${headCell} text-right`}>
                  Line total
                </th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className={tableRow}>
                  <td className={bodyCell}>{item.name}</td>
                  <td className={`${bodyCell} text-right tabular-nums`}>{item.quantity}</td>
                  <td className={`${bodyCell} text-right tabular-nums`}>
                    {money(item.priceCents)}
                  </td>
                  <td className={`${bodyCell} text-right tabular-nums`}>
                    {money(item.priceCents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/orders" className="text-sm font-medium text-accent hover:underline">
        ← Orders
      </Link>
      <Suspense
        fallback={
          <>
            <Skeleton className="h-14" />
            <Skeleton className="h-32" />
            <TableSkeleton rows={3} />
          </>
        }
      >
        <Order params={params} />
      </Suspense>
    </div>
  )
}
