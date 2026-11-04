import {
  BarChart,
  Card,
  Grid,
  Heading,
  Link,
  Skeleton,
  Stack,
  Table,
  Text,
  type Column,
} from '@weft-js/warp'
import { derived } from '@weft-js/core'
import { StatusBadge } from '#/components/StatusBadge'
import { count, date, money, roundMoney } from '#/lib/orders'
import { latestOrders, revenueByMonth, storeStats, type OrderRow } from '#/server/orders'

const dollars = (n: number) => roundMoney(n * 100)

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card eyebrow={label} class="stat">
      <Text role="title">{value}</Text>
    </Card>
  )
}

export function Stats() {
  const stats = storeStats()
  return (
    <Grid min="12rem" gap="related">
      <Stat label="Revenue" value={roundMoney(stats.value?.revenue ?? 0)} />
      <Stat label="Orders" value={count(stats.value?.orders ?? 0)} />
      <Stat label="Customers" value={count(stats.value?.customers ?? 0)} />
      <Stat label="Refunded" value={roundMoney(stats.value?.refunded ?? 0)} />
    </Grid>
  )
}

export const StatsLoading = () => (
  <Grid min="12rem" gap="related" aria-busy="true" aria-label="Loading the totals">
    <Skeleton height="5.25rem" />
    <Skeleton height="5.25rem" />
    <Skeleton height="5.25rem" />
    <Skeleton height="5.25rem" />
  </Grid>
)

/* @weft visible */
export function RevenueChart() {
  const months = revenueByMonth()
  return (
    <BarChart
      title="Revenue by month"
      description="Everything sold in each of the last twelve months, less refunds."
      data={months.value ?? []}
      x="month"
      series={[{ key: 'revenue', name: 'Revenue', color: 'var(--warp-color-accent-solid)' }]}
      format={dollars}
      axisFormat={dollars}
      empty={{
        title: 'No sales yet',
        detail: 'Your first month will show up here as soon as an order comes in.',
      }}
    />
  )
}

export const RevenueChartLoading = () => <Skeleton height="24rem" aria-label="Loading the chart" />

const columns: Column<OrderRow>[] = [
  {
    id: 'id',
    header: 'Order',
    rowHeader: true,
    value: (row) => `Order ${row.id}`,
    cell: (row) => <Link href={`/admin/orders/${row.id}`}>#{row.id}</Link>,
  },
  { id: 'customer', header: 'Customer' },
  {
    id: 'status',
    header: 'Status',
    card: 'badge',
    cell: (row) => <StatusBadge status={row.status} />,
  },
  { id: 'total', header: 'Total', numeric: true, value: (row) => money(row.totalCents) },
  { id: 'date', header: 'Date', value: (row) => date(row.createdAt) },
]

export function LatestOrders() {
  const latest = latestOrders()
  const rows = derived(() => latest.value ?? [])
  return (
    <Stack gap="related">
      <div class="section-head">
        <Heading level={2}>Latest orders</Heading>
        <Link href="/admin/orders">See all orders</Link>
      </div>
      <Table
        caption="Latest orders"
        captionHidden
        rows={rows}
        columns={columns}
        picker={false}
        empty={{ title: 'No orders yet', text: 'They land here the moment a customer checks out.' }}
      />
    </Stack>
  )
}

export const LatestOrdersLoading = () => (
  <Skeleton lines={10} height="1.75rem" aria-label="Loading the latest orders" />
)
