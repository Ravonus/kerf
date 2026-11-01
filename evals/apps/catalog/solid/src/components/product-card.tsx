import { Show } from "solid-js";

import { money } from "~/lib/format";

const kinds = ["lamp", "stool", "kettle", "shelf", "basket", "speaker", "tray", "planter", "satchel", "mug"];
const materials = ["oak", "linen", "copper", "slate", "walnut", "cedar", "ceramic", "brass"];

export function ProductArt(props: { name: string; size: number; class?: string; eager?: boolean }) {
  const words = () => props.name.toLowerCase().split(" ");
  return (
    <div class={`art ${props.class ?? ""}`} data-material={words().find((w) => materials.includes(w))}>
      <img
        src={`/art/${words().find((w) => kinds.includes(w)) ?? "parcel"}.svg`}
        alt=""
        width={props.size}
        height={props.size}
        loading={props.eager ? "eager" : "lazy"}
        decoding="async"
      />
    </div>
  );
}

export type Card = { slug: string; name: string; priceCents: number; stock: number };

export function ProductCard(props: { product: Card }) {
  return (
    <li>
      <a href={`/p/${props.product.slug}`} class="group block overflow-hidden rounded-xl border border-line bg-surface transition-shadow hover:shadow-md">
        <ProductArt name={props.product.name} size={80} class="aspect-[4/3]" />
        <div class="px-3 py-2.5">
          <p class="truncate text-sm font-medium group-hover:text-accent-text">{props.product.name}</p>
          <p class="mt-0.5 flex items-baseline justify-between gap-2 text-sm tabular-nums text-muted">
            {money(props.product.priceCents)}
            <Show when={props.product.stock === 0}>
              <span class="text-xs text-faint">Out of stock</span>
            </Show>
          </p>
        </div>
      </a>
    </li>
  );
}

export const grid = "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4";
