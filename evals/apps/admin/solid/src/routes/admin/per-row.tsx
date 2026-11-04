import { Title } from '@solidjs/meta'
import { createAsync, type RouteDefinition } from '@solidjs/router'
import { For, Suspense } from 'solid-js'

import { panel, td, th } from '~/components/button'
import { Loads } from '~/components/states'
import { StatusBadge } from '~/components/status-badge'
import { getCustomer, getRecentOrders } from '~/lib/data'
import { formatDay, money } from '~/lib/format'

export const route = { preload: () => void getRecentOrders() } satisfies RouteDefinition

type Order = NonNullable<Awaited<ReturnType<typeof getRecentOrders>>>[number]

export default function PerRow() {
  return (
    <>
      <Title>Order feed · Backroom</Title>
      <h1 class="text-2xl font-semibold tracking-tight">Order feed</h1>
      <div class="mt-6">
        <Loads what="The feed">
          <Orders />
        </Loads>
      </div>
    </>
  )
}

function Orders() {
  const orders = createAsync(() => getRecentOrders())
  return (
    <div class={`${panel} overflow-x-auto`}>
      <table class="w-full text-sm">
        <thead class="border-b border-line">
          <tr>
            <th scope="col" class={th}>
              Order
            </th>
            <th scope="col" class={th}>
              Customer
            </th>
            <th scope="col" class={th}>
              City
            </th>
            <th scope="col" class={th}>
              Status
            </th>
            <th scope="col" class={`${th} text-right`}>
              Total
            </th>
            <th scope="col" class={th}>
              Date
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-line">
          <For each={orders()}>{(order) => <Row order={order} />}</For>
        </tbody>
      </table>
    </div>
  )
}

function Row(props: { order: Order }) {
  const customer = createAsync(() => getCustomer(props.order.customerId))
  return (
    <tr>
      <td class={td}>
        <a
          href={`/admin/orders/${props.order.id}`}
          class="font-medium text-accent-text hover:underline"
        >
          #{props.order.id}
        </a>
      </td>
      <Suspense
        fallback={
          <td class={td} colspan="2">
            <span class="block h-4 w-32 animate-pulse rounded bg-sunken" />
          </td>
        }
      >
        <td class={td}>{customer()?.name}</td>
        <td class={`${td} text-muted`}>{customer()?.city}</td>
      </Suspense>
      <td class={td}>
        <StatusBadge status={props.order.status} />
      </td>
      <td class={`${td} text-right tabular-nums`}>{money(props.order.totalCents)}</td>
      <td class={`${td} text-muted`}>{formatDay(props.order.createdAt)}</td>
    </tr>
  )
}
