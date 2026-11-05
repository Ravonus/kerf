import { Title } from '@solidjs/meta'
import {
  createAsyncStore,
  useAction,
  useParams,
  useSubmissions,
  type RouteDefinition,
} from '@solidjs/router'
import { HttpStatusCode } from '@solidjs/start'
import { createMemo, For, Show } from 'solid-js'

import { panel, select, td, th } from '~/components/button'
import { getOrder, setStatus } from '~/lib/data'
import { formatMoment, money } from '~/lib/format'
import { statuses } from '~/lib/search'

export const route = {
  preload: ({ params }) => void getOrder(Number(params.id)),
} satisfies RouteDefinition

type Order = NonNullable<Awaited<ReturnType<typeof getOrder>>>

export default function OrderPage() {
  const params = useParams()
  // Deferred because a missing order has to answer 404, and a status can't change once the first byte is out.
  // A store, so a save's reply keeps the same `Details` and the select keeps focus.
  const order = createAsyncStore(() => getOrder(Number(params.id)), {
    deferStream: true,
    reconcile: { key: 'id' },
  })

  return (
    <>
      <a href="/admin/orders" class="text-sm font-medium text-muted hover:text-ink">
        ← Orders
      </a>
      <Show when={order() !== undefined}>
        <Show when={order()} keyed fallback={<Missing />}>
          {(o) => <Details order={o} />}
        </Show>
      </Show>
    </>
  )
}

function Missing() {
  return (
    <div class="py-16 text-center">
      <Title>Order not found · Backroom</Title>
      <HttpStatusCode code={404} />
      <h1 class="text-2xl font-semibold tracking-tight">Nothing on this shelf</h1>
      <p class="mt-2 text-muted">The order may be gone, or the address mistyped.</p>
    </div>
  )
}

function orderStatus(props: { order: Order }) {
  const save = useAction(setStatus)
  const saves = useSubmissions(setStatus)

  const mine = createMemo(() => [...saves].filter((s) => s.input[0] === props.order.id))
  const status = () => mine().findLast((s) => s.pending)?.input[1] ?? props.order.status
  const failed = () => {
    const last = mine().at(-1)
    return last && !last.pending && last.error
  }

  return { save, status, failed }
}

function orderItem(item: Order['items'][number]) {
  return (
    <tr>
      <td class={td}>{item.name}</td>
      <td class={`${td} text-right tabular-nums`}>{item.quantity}</td>
      <td class={`${td} text-right tabular-nums`}>{money(item.priceCents)}</td>
      <td class={`${td} text-right tabular-nums`}>{money(item.priceCents * item.quantity)}</td>
    </tr>
  )
}

function statusOption(s: string, status: () => string) {
  return (
    <option value={s} selected={status() === s}>
      {s}
    </option>
  )
}

function Details(props: { order: Order }) {
  const { save, status, failed } = orderStatus(props)

  return (
    <>
      <Title>{`Order #${props.order.id} · Backroom`}</Title>
      <div class="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Order #{props.order.id}</h1>
          <p class="mt-1 text-sm text-muted">{formatMoment(props.order.createdAt)} UTC</p>
        </div>
        <label class="w-44 text-sm font-medium">
          <span class="mb-1.5 block">Status</span>
          <select
            class={select}
            onInput={(e) => save(props.order.id, e.currentTarget.value).catch(() => {})}
          >
            <For each={statuses}>{(s) => statusOption(s, status)}</For>
          </select>
        </label>
      </div>
      <Show when={failed()}>
        <p role="alert" class="mt-3 text-right text-sm font-medium text-danger">
          That status wasn't saved. Check your connection and try again.
        </p>
      </Show>
      <div class="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section aria-labelledby="items" class={`${panel} overflow-hidden`}>
          <h2 id="items" class="px-4 pt-4 pb-2 font-semibold">
            Items
          </h2>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="border-b border-line">
                <tr>
                  <th scope="col" class={th}>
                    Product
                  </th>
                  <th scope="col" class={`${th} text-right`}>
                    Qty
                  </th>
                  <th scope="col" class={`${th} text-right`}>
                    Price
                  </th>
                  <th scope="col" class={`${th} text-right`}>
                    Line total
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-line">
                <For each={props.order.items}>{(item) => orderItem(item)}</For>
              </tbody>
              <tfoot class="border-t border-line font-semibold">
                <tr>
                  <td class={td} colspan="3">
                    Total
                  </td>
                  <td class={`${td} text-right tabular-nums`}>{money(props.order.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
        <section aria-labelledby="customer" class={`${panel} p-4`}>
          <h2 id="customer" class="font-semibold">
            Customer
          </h2>
          <p class="mt-2">{props.order.customer.name}</p>
          <p class="text-sm text-muted">{props.order.customer.email}</p>
          <p class="text-sm text-muted">{props.order.customer.city}</p>
        </section>
      </div>
    </>
  )
}
