import { For, Show } from 'solid-js'

import { artOf } from '~/lib/art'
import { money } from '~/lib/format'

export function ProductArt(props: { name: string; class?: string }) {
  const art = () => artOf(props.name)
  return (
    <span class={`art ${props.class ?? ''}`} data-material={art().material}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path fill-rule="evenodd" d={art().path} />
      </svg>
    </span>
  )
}

export const SoldOut = () => (
  <span class="rounded-full bg-sunken px-2 py-0.5 text-xs font-medium text-muted">Sold out</span>
)

export type Card = { slug: string; name: string; priceCents: number; stock: number }

export function ProductCard(props: { product: Card }) {
  return (
    <li>
      <a href={`/p/${props.product.slug}`} class="group flex flex-col gap-1">
        <ProductArt name={props.product.name} />
        <span class="group-hover:text-accent-text">{props.product.name}</span>
        <span class="flex items-center gap-1">
          <span class="font-semibold tabular-nums">{money(props.product.priceCents)}</span>
          <Show when={props.product.stock === 0}>
            <SoldOut />
          </Show>
        </span>
      </a>
    </li>
  )
}

export const GridSkeleton = (props: { count: number }) => (
  <ul aria-hidden="true" class={`${wideGrid} animate-pulse`}>
    <For each={Array.from({ length: props.count })}>
      {() => (
        <li>
          <div class="aspect-square rounded-[20px] bg-sunken" />
          <div class="mt-1 h-6 w-3/4 rounded bg-sunken" />
          <div class="mt-1 h-6 w-1/4 rounded bg-sunken" />
        </li>
      )}
    </For>
  </ul>
)

export const grid = 'grid grid-cols-2 gap-5 sm:grid-cols-3'
export const wideGrid = 'grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4'
