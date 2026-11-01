import type { Meta } from '@weft/start'
import { Heading, Link, Skeleton, Stack, Table, Text, type Column } from '@weft/warp'
import { Boundary, derived } from 'weft'
import { Failed } from '#/components/Failed'
import { StatusBadge } from '#/components/StatusBadge'
import { money } from '#/lib/orders'
import { getCustomer, recentOrderIds } from '#/server/reports'

export const meta: Meta = { title: 'Order feed' }

type FeedRow = { id: number; customerId: number; status: string; totalCents: number }

function CustomerCell({ id }: { id: number }) {
  const customer = getCustomer(() => ({ id }))
  return <>{customer.value?.name} <Text subtle>{customer.value?.city}</Text></>
}

const columns: Column<FeedRow>[] = [
  { id: 'id', header: 'Order', rowHeader: true, value: row => `Order ${row.id}`, cell: row => <Link href={`/admin/orders/${row.id}`}>#{row.id}</Link> },
  { id: 'customer', header: 'Customer', cell: row => <CustomerCell id={row.customerId} /> },
  { id: 'status', header: 'Status', card: 'badge', cell: row => <StatusBadge status={row.status} /> },
  { id: 'total', header: 'Total', numeric: true, value: row => money(row.totalCents) },
]

function Feed() {
  const recent = recentOrderIds()
  const rows = derived(() => recent.value ?? [])
  return <Table caption="Recent orders" captionHidden rows={rows} columns={columns} picker={false} empty={{ title: 'Quiet so far', text: 'New orders land here as they come in.' }} />
}

export default function OrderFeed() {
  return (
    <Stack gap="group">
      <Stack gap="tight">
        <Heading level={1} role="title">Order feed</Heading>
        <Text subtle>The last 50 orders, each with who placed it.</Text>
      </Stack>
      <Boundary pending={<Skeleton lines={12} height="1.75rem" aria-label="Loading the feed" />} error={(_, retry) => <Failed what="The feed" retry={retry} />}>
        <Feed />
      </Boundary>
    </Stack>
  )
}
