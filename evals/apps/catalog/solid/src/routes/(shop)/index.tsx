import { Meta, Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { For } from "solid-js";

import { heading } from "~/components/button";
import { grid, ProductCard } from "~/components/product-card";
import { getHome } from "~/lib/data";

export const route = { preload: () => void getHome() } satisfies RouteDefinition;

export default function Home() {
  // Deferred: the shelves and products are what this page is, so they belong in the first HTML a crawler reads.
  const home = createAsync(() => getHome(), { deferStream: true });
  return (
    <>
      <Title>Commonplace · Everyday goods, made to last</Title>
      <Meta name="description" content="Lamps, kettles, shelves and more: dependable pieces for every room, made to be used and repaired." />
      <section class="max-w-2xl py-6 sm:py-10">
        <h1 class={`${heading} text-4xl text-balance sm:text-5xl`}>Everyday goods, made to last.</h1>
        <p class="mt-3 text-lg text-muted">Dependable pieces for every room, built to be used and repaired when they wear.</p>
      </section>
      <nav aria-label="Categories" class="flex flex-wrap gap-2">
        <For each={home()?.categories}>
          {(c) => (
            <a href={`/c/${c.slug}`} class="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-sunken">
              {c.name}
            </a>
          )}
        </For>
      </nav>
      <section aria-labelledby="featured" class="mt-10">
        <h2 id="featured" class={`${heading} text-2xl`}>
          Featured
        </h2>
        <ul class={`${grid} mt-4`}>
          <For each={home()?.featured}>{(p) => <ProductCard product={p} />}</For>
        </ul>
      </section>
    </>
  );
}
