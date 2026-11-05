import { Title } from '@solidjs/meta'
import { createAsync, useSubmissions, type RouteDefinition } from '@solidjs/router'
import { For, Show, type JSX } from 'solid-js'

import { heading, step, textLink } from '~/components/button'
import { ProductArt } from '~/components/product-card'
import { getCart, setQuantity } from '~/lib/data'
import { money } from '~/lib/format'

export const route = { preload: () => void getCart() } satisfies RouteDefinition

type Line = NonNullable<Awaited<ReturnType<typeof getCart>>>[number]

export default function Cart() {
  const lines = createAsync(() => getCart())
  const steps = useSubmissions(setQuantity)
  const wanted = (id: number) =>
    [...steps]
      .filter((s) => s.pending && s.input[0].get('product') === String(id))
      .at(-1)
      ?.input[0].get('quantity')
  const quantity = (l: Line) => Number(wanted(l.id) ?? l.quantity)
  const shown = () => lines()?.filter((l) => quantity(l) > 0) ?? []
  const subtotal = () => shown().reduce((sum, l) => sum + l.priceCents * quantity(l), 0)
  const failed = () => [...steps].at(-1)?.error

  const To = quantityForm(quantity)

  return (
    <div class="mx-auto flex max-w-290 flex-col gap-5 px-8 py-12">
      <Title>Your cart · Mendwell</Title>
      <h1 class={`${heading} text-3xl`}>Your cart</h1>
      <Show when={failed()}>
        <p role="alert" class="font-medium text-danger">
          That didn't save. Your cart is back as it was. Try again in a moment.
        </p>
      </Show>
      <Show when={shown().length} fallback={emptyCart()}>
        <ul aria-label="Cart">
          <For each={shown()}>
            {(line) => (
              <li class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line py-2.5 md:grid-cols-[4.5rem_minmax(0,1fr)_auto_5.5rem_auto]">
                <ProductArt name={line.name} />
                <div>
                  <a href={`/p/${line.slug}`}>{line.name}</a>
                  <p class="text-muted">{`${money(line.priceCents)} each`}</p>
                </div>
                <div class="inline-flex items-center gap-1 tabular-nums">
                  <To
                    line={line}
                    to={quantity(line) - 1}
                    label={`One fewer ${line.name}`}
                    class={step}
                  >
                    −
                  </To>
                  <span aria-label={`Quantity of ${line.name}`}>{quantity(line)}</span>
                  <To
                    line={line}
                    to={quantity(line) + 1}
                    label={`One more ${line.name}`}
                    class={step}
                    disabled={quantity(line) >= Math.min(line.stock, 99)}
                  >
                    +
                  </To>
                </div>
                <span class="text-end font-semibold tabular-nums">
                  {money(line.priceCents * quantity(line))}
                </span>
                <To
                  line={line}
                  to={0}
                  label={`Remove ${line.name}`}
                  class={`${textLink} cursor-pointer text-sm`}
                >
                  Remove
                </To>
              </li>
            )}
          </For>
        </ul>
        <div class="flex items-baseline justify-between text-xl">
          <p class="text-muted">Subtotal</p>
          <span class="font-semibold tabular-nums">{money(subtotal())}</span>
        </div>
        <p class="text-muted">Checkout opens soon. Your cart keeps until then.</p>
      </Show>
    </div>
  )
}

function quantityForm(quantity: (line: Line) => number) {
  const To = (props: {
    line: Line
    to: number
    label: string
    class: string
    disabled?: boolean
    children: JSX.Element
  }) => (
    <form action={setQuantity} method="post" class="contents">
      <input type="hidden" name="product" value={props.line.id} />
      <input type="hidden" name="quantity" value={props.to} />
      <input type="hidden" name="change" value={props.to - quantity(props.line)} />
      <button type="submit" aria-label={props.label} class={props.class} disabled={props.disabled}>
        {props.children}
      </button>
    </form>
  )
  return To
}

function emptyCart() {
  return (
    <div class="flex flex-col items-start gap-1 py-12">
      <h2 class={`${heading} text-xl`}>Your cart is empty</h2>
      <p class="text-muted">Everything you add stays here for sixty days.</p>
      <a href="/" class={textLink}>
        Back to the aisles
      </a>
    </div>
  )
}
