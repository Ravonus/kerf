import { Title } from "@solidjs/meta";
import { createAsync, type RouteDefinition } from "@solidjs/router";
import { For } from "solid-js";

import { heading } from "~/components/button";
import { ProductArt, ProductCard, wideGrid } from "~/components/product-card";
import { getHome } from "~/lib/data";

export const route = { preload: () => void getHome() } satisfies RouteDefinition;

const promises = [
  ["Screws, not glue", "Every piece comes apart with a screwdriver you already own."],
  ["Parts on the shelf", "Handles, hinges and cords are stocked for as long as we sell the piece."],
  ["Repairs by post", "Send it in, and it comes back working. Free for ten years."],
];

export default function Home() {
  // Deferred: the aisles and products are what this page is, so they belong in the first HTML a crawler reads.
  const home = createAsync(() => getHome(), { deferStream: true });
  return (
    <div class="mx-auto max-w-360 px-8">
      <Title>Goods made to be mended · Mendwell</Title>
      <section class="grid items-center gap-12 py-8 md:grid-cols-[3fr_2fr]">
        <div class="flex flex-col items-start gap-2.5">
          <h1 class={`${heading} text-4xl sm:text-5xl`}>Buy it once. Mend it forever.</h1>
          <p class="max-w-xl text-xl">Everyday goods in oak, copper, linen and slate, built with screws instead of glue, and repaired free for ten years.</p>
          <a href="#featured" class="rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink hover:bg-accent-hover">
            See this month's table
          </a>
        </div>
        <div class="grid grid-cols-2 gap-2.5">
          <ProductArt name="Copper Kettle" class="col-span-2 aspect-2/1!" />
          <ProductArt name="Oak Stool" />
          <ProductArt name="Slate Lamp" />
        </div>
      </section>
      <div class="flex flex-col gap-8">
        <section aria-labelledby="aisles-title" class="flex flex-col gap-2.5">
          <h2 id="aisles-title" class={`${heading} text-xl`}>
            Aisles
          </h2>
          <nav aria-label="Aisles" class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] border-t-2 border-ink">
            <For each={home()?.categories}>
              {(c) => (
                <a href={`/c/${c.slug}`} class="border-b border-line py-2.5 text-xl font-semibold hover:text-accent-text">
                  {c.name}
                </a>
              )}
            </For>
          </nav>
        </section>
        <section id="featured" aria-labelledby="featured-title" class="flex flex-col gap-2.5">
          <h2 id="featured-title" class={`${heading} text-xl`}>
            On the front table
          </h2>
          <ul class={wideGrid}>
            <For each={home()?.featured}>{(p) => <ProductCard product={p} />}</For>
          </ul>
        </section>
        <div class="grid gap-5 border-t-2 border-ink pt-12 md:grid-cols-3">
          <For each={promises}>
            {([title, text]) => (
              <div class="flex flex-col gap-1">
                <h3 class={`${heading} text-lg`}>{title}</h3>
                <p class="text-muted">{text}</p>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
