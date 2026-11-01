import { Title } from "@solidjs/meta";
import { createAsync, useSubmissions, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";

import { heading, textLink } from "~/components/button";
import { ProductArt } from "~/components/product-card";
import { getCart, removeFromCart } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: () => void getCart() } satisfies RouteDefinition;

export default function Cart() {
  const lines = createAsync(() => getCart());
  const removing = useSubmissions(removeFromCart);
  const gone = (id: number) => [...removing].some((s) => s.pending && s.input[0].get("product") === String(id));
  const shown = () => lines()?.filter((l) => !gone(l.id)) ?? [];
  const subtotal = () => shown().reduce((sum, l) => sum + l.priceCents * l.quantity, 0);

  return (
    <>
      <Title>Your cart · Commonplace</Title>
      <h1 class={`${heading} text-3xl sm:text-4xl`}>Your cart</h1>
      <Show
        when={shown().length}
        fallback={
          <div class="py-16 text-center">
            <p class={`${heading} text-xl`}>Your cart is empty</p>
            <a href="/" class={`${textLink} mt-2 inline-block text-sm`}>
              See what's on the shelves
            </a>
          </div>
        }
      >
        <ul class="mt-6 divide-y divide-line rounded-2xl border border-line bg-surface">
          <For each={shown()}>
            {(line) => (
              <li class="flex items-center gap-4 p-3 sm:p-4">
                <ProductArt name={line.name} size={40} class="size-16 flex-none rounded-lg" />
                <div class="min-w-0 flex-1">
                  <a href={`/p/${line.slug}`} class="block truncate font-medium hover:text-accent-text">
                    {line.name}
                  </a>
                  <p class="text-sm text-muted tabular-nums">{`${line.quantity} × ${money(line.priceCents)}`}</p>
                </div>
                <p class="font-medium tabular-nums">{money(line.priceCents * line.quantity)}</p>
                <form action={removeFromCart} method="post">
                  <input type="hidden" name="product" value={line.id} />
                  <button type="submit" aria-label={`Remove ${line.name}`} class={`${textLink} cursor-pointer text-sm`}>
                    Remove
                  </button>
                </form>
              </li>
            )}
          </For>
        </ul>
        <div class="mt-6 flex items-center justify-between gap-4">
          <a href="/" class={`${textLink} text-sm`}>
            Keep shopping
          </a>
          <p class="text-lg font-semibold tabular-nums">{`Subtotal ${money(subtotal())}`}</p>
        </div>
      </Show>
    </>
  );
}
