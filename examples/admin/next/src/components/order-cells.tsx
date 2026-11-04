import Link from 'next/link'
import { StatusBadge } from './status-badge'
import type { OrderRow } from '@/lib/orders'

export const headCell =
  'px-4 py-2.5 text-left text-xs font-semibold tracking-wide text-muted uppercase'
export const bodyCell = 'h-11 px-4 py-2 text-sm'
export const tableRow = 'border-b border-line transition-colors last:border-0 hover:bg-tint/60'

export function OrderLink({ id }: { id: number }) {
  return (
    <Link
      href={`/admin/orders/${id}`}
      className="font-medium text-accent-strong tabular-nums hover:underline"
    >
      #{id}
    </Link>
  )
}

export function OrderCells({ order }: { order: OrderRow }) {
  return (
    <>
      <td className={bodyCell}>
        <OrderLink id={order.id} />
      </td>
      <td className={bodyCell}>{order.customer}</td>
      <td className={bodyCell}>
        <StatusBadge status={order.status} />
      </td>
      <td className={`${bodyCell} text-right tabular-nums`}>{order.total}</td>
      <td className={`${bodyCell} whitespace-nowrap text-muted tabular-nums`}>{order.date}</td>
    </>
  )
}
