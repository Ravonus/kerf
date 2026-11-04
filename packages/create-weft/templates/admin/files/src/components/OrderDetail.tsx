import {
  Card,
  Grid,
  Heading,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  toast,
  type Column,
} from '@weft-js/warp'
import { derived } from '@weft-js/core'
import { StatusBadge } from '#/components/StatusBadge'
import { date, money, statuses, type Status } from '#/lib/orders'
import { getOrder, setOrderStatus } from '#/server/orders'

type Item = { id: number; product: string; quantity: number; priceCents: number }

const options = statuses.map((status) => ({ value: status, label: status }))

const columns: Column<Item>[] = [
  { id: 'product', header: 'Product', rowHeader: true },
  { id: 'quantity', header: 'Quantity', numeric: true },
  { id: 'price', header: 'Price', numeric: true, value: (item) => money(item.priceCents) },
  {
    id: 'line',
    header: 'Line total',
    numeric: true,
    value: (item) => money(item.priceCents * item.quantity),
  },
]

export function OrderDetail({ id }: { id: number }) {
  const order = getOrder(() => ({ id }))
  const items = derived(() => order.value?.items ?? [])
  const save = (status: Status) =>
    setOrderStatus({ id, status })
      .then(() => toast.show({ tone: 'positive', title: `Order #${id} is now ${status}` }))
      .catch(() =>
        toast.show({
          tone: 'critical',
          title: "That status wasn't saved",
          description: 'The order is as it was. Try again in a moment.',
        }),
      )

  return (
    <Stack gap="group">
      <div class="section-head">
        <Heading level={1} role="title">
          Order #{id}
        </Heading>
        {order.value && <StatusBadge status={order.value.status} />}
      </div>
      <Grid min="16rem" gap="related">
        <Card eyebrow="Customer">
          <Stack gap="tight">
            <strong>{order.value?.customer}</strong>
            <Text subtle>{order.value?.email}</Text>
            <Text subtle>{order.value?.city}</Text>
          </Stack>
        </Card>
        <Card eyebrow="Order">
          <Stack gap="tight">
            <strong>{money(order.value?.totalCents ?? 0)}</strong>
            <Text subtle>Placed {order.value ? date(order.value.createdAt) : ''}</Text>
          </Stack>
        </Card>
        <Card eyebrow="Fulfilment">
          <Select
            label="Status"
            options={options}
            value={order.value?.status}
            disabled={setOrderStatus.pending.value}
            onChange={(e) => save((e.currentTarget as HTMLSelectElement).value as Status)}
          />
        </Card>
      </Grid>
      <Table
        caption="Items"
        rows={items}
        columns={columns}
        picker={false}
        empty={{ title: 'No items', text: 'This order has no line items.' }}
      />
    </Stack>
  )
}

export const OrderLoading = () => (
  <Skeleton lines={8} height="2rem" aria-label="Loading the order" />
)
