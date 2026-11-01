import type { LoadArgs, Meta, RouteProps } from '@weft/start'
import { Heading, Stack } from '@weft/warp'
import { Boundary } from 'weft'
import { Failed } from '#/components/Failed'
import { OrdersFilters } from '#/components/OrdersFilters'
import { OrdersLoading, OrdersTable } from '#/components/OrdersTable'
import { viewOf } from '#/lib/orders'

export const load = ({ request }: LoadArgs) => ({ view: viewOf(request.url) })

export const meta: Meta = { title: 'Orders' }

export default function Orders(props: RouteProps<typeof load>) {
  return (
    <Stack gap="group">
      <Heading level={1} role="title">Orders</Heading>
      <OrdersFilters view={props.data.view} />
      <Boundary pending={<OrdersLoading />} error={(_, retry) => <Failed what="The orders" retry={retry} />}>
        <OrdersTable view={props.data.view} />
      </Boundary>
    </Stack>
  )
}
