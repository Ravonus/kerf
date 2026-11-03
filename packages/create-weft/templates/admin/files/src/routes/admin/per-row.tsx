import type { Meta } from '@weft-js/start'
import { Heading, Link, Skeleton, Stack, Table, Text, type Column } from '@weft-js/warp'
import { Boundary, derived } from '@weft-js/core'
import { Failed } from '#/components/Failed'
import { StatusBadge } from '#/components/StatusBadge'
import { date, money } from '#/lib/orders'
import { getCustomer, recentOrderIds } from '#/server/reports'

export const meta: Meta = { title: 'Order feed' }

type FeedRow = { id: number; customerId: number; status: string; totalCents: number; createdAt: string }

function CustomerCell({ id }: { id: number }) {
  const customer = getCustomer(() => ({ id }))
  return <>{customer.value?.name} <Text subtle>{customer.value?.city}</Text></>
}

const columns: Column<FeedRow>[] = [
  { id: 'id', header: 'Order', rowHeader: true, value: row => `Order ${row.id}`, cell: row => <Link href={`/admin/orders/${row.id}`}>#{row.id}</Link> },
  { id: 'customer', header: 'Customer', cell: row => <CustomerCell id={row.customerId} /> },
  { id: 'status', header: 'Status', card: 'badge', cell: row => <StatusBadge status={row.status} /> },
  { id: 'total', header: 'Total', numeric: true, value: row => money(row.totalCents) },
  { id: 'date', header: 'Date', value: row => date(row.createdAt) },
]

function Feed() {
  const recent = recentOrderIds()
  const rows = derived(() => recent.value ?? [])
  return <Table caption="Recent orders" captionHidden rows={rows} columns={columns} picker={false} empty={{ title: 'Quiet so far', text: 'New orders land here as they come in.' }} />
}

// A plain box, not warp's Stack: there the Boundary would be part of an island that waits for a click, and a stream that stops
// early would leave the skeleton up. On its own the island runs as the page shows, and fills in from what the page carries.
export default function OrderFeed() {
  return (
    <div class="flow">
      <Stack gap="tight">
        <Heading level={1} role="title">Order feed</Heading>
        <Text subtle>The last 50 orders, each with who placed it.</Text>
      </Stack>
      <Boundary pending={<Skeleton lines={12} height="1.75rem" aria-label="Loading the feed" />} error={(_, retry) => <Failed what="The feed" retry={retry} />}>
        <Feed />
      </Boundary>
    </div>
  )
}
