import { Title } from '@solidjs/meta'
import {
  A,
  createAsyncStore,
  useAction,
  useSearchParams,
  useSubmissions,
  type RouteDefinition,
} from '@solidjs/router'
import { createEffect, createMemo, createSelector, createSignal, For, on, Show } from 'solid-js'

import { field, pageLink, panel, primary, select, td, th } from '~/components/button'
import { Loads, Rows } from '~/components/states'
import { StatusBadge } from '~/components/status-badge'
import { getOrders, markShipped } from '~/lib/data'
import { formatDay, money } from '~/lib/format'
import {
  pageSize,
  parseSearch,
  searchHref,
  statuses,
  type OrderSearch,
  type Sort,
} from '~/lib/search'

export const route = {
  preload: ({ location }) => void getOrders(parseSearch(location.query)),
} satisfies RouteDefinition

const columns: { sort: Sort; label: string; right?: boolean }[] = [
  { sort: 'id', label: 'Order' },
  { sort: 'customer', label: 'Customer' },
  { sort: 'status', label: 'Status' },
  { sort: 'total', label: 'Total', right: true },
  { sort: 'created', label: 'Date' },
]

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const search = createMemo(() => parseSearch(params))

  // A new search starts from the first page.
  const refine = (change: { status?: string; q?: string }) =>
    setParams({ ...change, page: undefined })

  function sortBy(sort: Sort) {
    const s = search()
    setParams(
      { sort, dir: s.sort === sort && s.dir === 'asc' ? 'desc' : 'asc', page: undefined },
      { scroll: false },
    )
  }

  return (
    <>
      <Title>Orders · Backroom</Title>
      <h1 class="text-2xl font-semibold tracking-tight">Orders</h1>
      <form
        method="get"
        action="/admin/orders"
        role="search"
        class="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          refine({ q: new FormData(e.currentTarget).get('q')?.toString().trim() || undefined })
        }}
      >
        <input type="hidden" name="sort" value={params.sort ?? ''} disabled={!params.sort} />
        <input type="hidden" name="dir" value={params.dir ?? ''} disabled={!params.dir} />
        <input
          name="q"
          aria-label="Search"
          placeholder="Search customers"
          value={search().q ?? ''}
          autocomplete="off"
          enterkeyhint="search"
          class={`${field} sm:max-w-xs`}
        />
        <select
          name="status"
          aria-label="Status"
          class={`${select} sm:w-40`}
          onInput={(e) => refine({ status: e.currentTarget.value || undefined })}
        >
          <option value="" selected={!search().status}>
            All statuses
          </option>
          <For each={statuses}>
            {(s) => (
              <option value={s} selected={search().status === s}>
                {s}
              </option>
            )}
          </For>
        </select>
      </form>
      <div class="mt-4">
        <Loads what="Orders" fallback={<Rows count={12} label="Loading orders" />}>
          <OrderTable search={search()} sortBy={sortBy} />
        </Loads>
      </div>
    </>
  )
}

type OrderTableProps = { search: OrderSearch; sortBy(sort: Sort): void }

function orderTableState(props: OrderTableProps) {
  const data = createAsyncStore(() => getOrders(props.search), { reconcile: { key: 'id' } })
  const rows = () => data()?.rows ?? []

  const [picked, setPicked] = createSignal<ReadonlySet<number>>(new Set())
  const isPicked = createSelector(picked, (id: number, set) => set.has(id))
  const mark = useAction(markShipped)
  const marks = useSubmissions(markShipped)

  createEffect(
    on(
      () => searchHref(props.search, props.search.page),
      () => setPicked(new Set<number>()),
      { defer: true },
    ),
  )

  const shipping = createMemo(() => {
    const ids = new Set<string>()
    for (const s of marks)
      if (s.pending) for (const id of s.input[0].getAll('id')) ids.add(String(id))
    return ids
  })
  const failed = () => [...marks].some((s) => !s.pending && s.error)

  function toggle(id: number) {
    const next = new Set(picked())
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }
  const allPicked = () => rows().length > 0 && rows().every((r) => picked().has(r.id))

  function submit(e: SubmitEvent & { currentTarget: HTMLFormElement }) {
    e.preventDefault()
    const was = picked()
    for (const s of marks) if (!s.pending) s.clear()
    mark(new FormData(e.currentTarget)).catch(() => setPicked(was))
    setPicked(new Set<number>())
  }

  const from = () => (props.search.page - 1) * pageSize
  const pages = () => Math.ceil((data()?.total ?? 0) / pageSize)

  return {
    data,
    rows,
    picked,
    setPicked,
    isPicked,
    shipping,
    failed,
    toggle,
    allPicked,
    submit,
    from,
    pages,
  }
}

type OrderTableState = ReturnType<typeof orderTableState>

function orderColumn(c: (typeof columns)[number], props: OrderTableProps) {
  const active = () => props.search.sort === c.sort
  return (
    <th
      scope="col"
      aria-sort={active() ? (props.search.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      class={`${th} ${c.right ? 'text-right' : ''}`}
    >
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1 uppercase hover:text-ink"
        onClick={() => props.sortBy(c.sort)}
      >
        {c.label}
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          class="size-3"
          classList={{
            'opacity-0': !active(),
            'rotate-180': active() && props.search.dir === 'asc',
          }}
        >
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </th>
  )
}

function orderRow(
  order: Awaited<ReturnType<typeof getOrders>>['rows'][number],
  model: OrderTableState,
) {
  const { isPicked, toggle, shipping } = model
  return (
    <tr class="hover:bg-sunken/60">
      <td class="pl-4">
        <input
          type="checkbox"
          form="bulk"
          name="id"
          value={order.id}
          aria-label={`Select order ${order.id}`}
          class="check"
          checked={isPicked(order.id)}
          onInput={() => toggle(order.id)}
        />
      </td>
      <td class={td}>
        <a href={`/admin/orders/${order.id}`} class="font-medium text-accent-text hover:underline">
          #{order.id}
        </a>
      </td>
      <td class={td}>{order.customer}</td>
      <td class={td}>
        <StatusBadge status={shipping().has(String(order.id)) ? 'shipped' : order.status} />
      </td>
      <td class={`${td} text-right tabular-nums`}>{money(order.totalCents)}</td>
      <td class={`${td} text-muted`}>{formatDay(order.createdAt)}</td>
    </tr>
  )
}

function watchSelection(el: HTMLInputElement, model: OrderTableState) {
  createEffect(() => (el.indeterminate = model.picked().size > 0 && !model.allPicked()))
}

function toggleAll(model: OrderTableState) {
  model.setPicked(new Set<number>(model.allPicked() ? [] : model.rows().map((r) => r.id)))
}

function pageCount(model: OrderTableState) {
  return model.data()?.total
    ? `${(model.from() + 1).toLocaleString('en-US')}–${(model.from() + model.rows().length).toLocaleString('en-US')} of ${model.data()!.total.toLocaleString('en-US')}`
    : '0 orders'
}

function OrderTable(props: OrderTableProps) {
  const model = orderTableState(props)
  const { rows, picked, failed, allPicked, submit } = model
  return (
    <>
      {/* The row checkboxes belong to this form from a distance, so a table can stay a table. */}
      <form
        id="bulk"
        action={markShipped}
        method="post"
        onSubmit={submit}
        class="mb-3 flex items-center gap-3"
      >
        <button type="submit" class={primary} disabled={!picked().size}>
          Mark shipped
        </button>
        <span class="text-sm text-muted tabular-nums">
          {picked().size ? `${picked().size} selected` : ''}
        </span>
      </form>
      <Show when={failed()}>
        <p role="alert" class="mb-3 text-sm font-medium text-danger">
          Those orders weren't updated. Check your connection and try again.
        </p>
      </Show>
      <div class={`${panel} overflow-x-auto`}>
        <table class="w-full text-sm">
          <thead class="border-b border-line">
            <tr>
              <th scope="col" class="w-10 pl-4">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  class="check"
                  checked={allPicked()}
                  ref={(el) => watchSelection(el, model)}
                  onInput={() => toggleAll(model)}
                />
              </th>
              <For each={columns}>{(c) => orderColumn(c, props)}</For>
            </tr>
          </thead>
          <tbody class="divide-y divide-line">
            <For each={rows()}>{(order) => orderRow(order, model)}</For>
          </tbody>
        </table>
        <Show when={!rows().length}>
          <p class="px-4 py-10 text-center text-muted">No orders match that search.</p>
        </Show>
      </div>
      <nav aria-label="Pages" class="mt-4 flex items-center justify-between gap-3">
        <p class="text-sm text-muted tabular-nums">{pageCount(model)}</p>
        <div class="flex gap-2">
          <Show when={props.search.page > 1}>
            <A
              href={searchHref(props.search, props.search.page - 1)}
              class={pageLink}
              activeClass=""
              inactiveClass=""
            >
              Previous
            </A>
          </Show>
          <Show when={props.search.page < model.pages()}>
            <A
              href={searchHref(props.search, props.search.page + 1)}
              class={pageLink}
              activeClass=""
              inactiveClass=""
            >
              Next
            </A>
          </Show>
        </div>
      </nav>
    </>
  )
}
