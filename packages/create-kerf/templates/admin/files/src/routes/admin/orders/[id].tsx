import { notFound, type LoadArgs, type Meta, type RouteProps } from '@kerf-js/start'
import { Boundary } from '@kerf-js/core'
import { Failed } from '#/components/Failed'
import { OrderDetail, OrderLoading } from '#/components/OrderDetail'
import { getOrder } from '#/server/orders'

export const load = async ({ params }: LoadArgs<'/admin/orders/[id]'>) => {
  const id = Number(params.id)
  if (!Number.isInteger(id) || id < 1) return notFound()
  return (await getOrder.fetch({ id })) ? { id } : notFound()
}

export const meta: Meta<typeof load> = ({ data }) => ({ title: `Order #${data.id}` })

export default function Order(props: RouteProps<typeof load, '/admin/orders/[id]'>) {
  return (
    <Boundary
      pending={<OrderLoading />}
      error={(_, retry) => <Failed what="This order" retry={retry} />}
    >
      <OrderDetail id={props.data.id} />
    </Boundary>
  )
}
