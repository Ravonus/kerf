import { navigate } from '@kerf/start'
import {
  Button,
  Link,
  Skeleton,
  Table,
  Text,
  toast,
  type Column,
  type TableSort,
} from '@kerf/veneer'
import { derived, state, watch, type State } from '@kerf/core'
import { StatusBadge } from '#/components/StatusBadge'
import { count, date, money, PAGE_SIZE, viewHref, type OrderView, type SortKey } from '#/lib/orders'
import { listOrders, markShipped, type OrderRow } from '#/server/orders'

const columns: Column<OrderRow>[] = [
  {
    id: 'id',
    header: 'Order',
    sort: true,
    rowHeader: true,
    value: (row) => `Order ${row.id}`,
    cell: (row) => <Link href={`/admin/orders/${row.id}`}>#{row.id}</Link>,
  },
  { id: 'customer', header: 'Customer', sort: true },
  {
    id: 'status',
    header: 'Status',
    sort: true,
    card: 'badge',
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: 'total',
    header: 'Total',
    sort: true,
    numeric: true,
    value: (row) => money(row.totalCents),
  },
  { id: 'created', header: 'Date', sort: true, value: (row) => date(row.createdAt) },
]

const tableSort = (view: OrderView): TableSort => ({
  id: view.sort,
  dir: view.dir === 'asc' ? 'ascending' : 'descending',
})

async function shipOrders(
  keys: string[],
  view: () => OrderView,
  selected: State<Record<string, boolean>>,
) {
  try {
    await markShipped({ ids: keys.map(Number), view: { ...view() } })
    selected.value = {}
    toast.show({
      tone: 'positive',
      title: keys.length === 1 ? '1 order marked shipped' : `${keys.length} orders marked shipped`,
    })
  } catch {
    toast.show({
      tone: 'critical',
      title: "Those orders weren't updated",
      description: 'Your selection is still here. Try again in a moment.',
    })
  }
}

export function OrdersTable({ view }: { view: OrderView }) {
  const orders = listOrders(() => ({ ...view }))
  const rows = derived(() => orders.value?.rows ?? [])
  const total = derived(() => orders.value?.total ?? 0)
  const pages = derived(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const selected = state<Record<string, boolean>>({})
  const sort = state.linked(() => tableSort(view))

  // A ticked row off screen shouldn't be shipped by accident.
  watch(
    () => viewHref(view),
    () => {
      selected.value = {}
    },
  )

  const sortBy = (next: TableSort) =>
    navigate(
      viewHref({
        ...view,
        page: 1,
        sort: next.id as SortKey,
        dir: next.dir === 'ascending' ? 'asc' : 'desc',
      }),
    )

  const currentView = () => view
  const ship = (keys: string[]) => shipOrders(keys, currentView, selected)

  return (
    <>
      <Table
        caption="Orders"
        captionHidden
        rows={rows}
        columns={columns}
        server
        sort={sort}
        onSortChange={sortBy}
        selection={selected}
        bulk={(keys) => (
          <Button loading={markShipped.pending.value} onClick={() => ship(keys)}>
            Mark shipped
          </Button>
        )}
        empty={{
          title: 'No orders match',
          text:
            view.q || view.status
              ? 'Try another name, or a different status.'
              : 'New orders land here the moment a customer checks out.',
        }}
      />
      <nav class="pager" aria-label="Pages">
        {view.page > 1 ? (
          <Link href={viewHref({ ...view, page: view.page - 1 })}>Previous</Link>
        ) : (
          <span aria-disabled="true">Previous</span>
        )}
        <Text subtle>
          Page {view.page} of {count(pages.value)}, {count(total.value)} orders
        </Text>
        {view.page < pages.value ? (
          <Link href={viewHref({ ...view, page: view.page + 1 })}>Next</Link>
        ) : (
          <span aria-disabled="true">Next</span>
        )}
      </nav>
    </>
  )
}

export const OrdersLoading = () => (
  <Skeleton lines={12} height="1.75rem" aria-label="Loading orders" />
)
