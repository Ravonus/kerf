import { Meta, Title } from "@solidjs/meta";
import { createAsync, useParams, useSubmission, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";

import { heading, primary } from "~/components/button";
import { ProductArt, ProductCard, SoldOut, wideGrid } from "~/components/product-card";
import { NotFound } from "~/components/states";
import { addToCart, getProduct } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: ({ params }) => void getProduct(params.slug!) } satisfies RouteDefinition;

type Product = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

const stockLine = (stock: number) => (stock === 0 ? "Back when the workshop catches up." : stock < 5 ? `Only ${stock} left.` : "In stock, ships in two days.");

export default function ProductPage() {
  const params = useParams();
  // Deferred because an unknown product has to answer 404, and a status can't change once the first byte is out.
  const product = createAsync(() => getProduct(params.slug!), { deferStream: true });

  return (
    <Show when={product() !== undefined}>
      <Show
        when={product()}
        keyed
        fallback={
          <>
            <Title>Not on the shelves · Mendwell</Title>
            <NotFound />
          </>
        }
      >
        {(p) => <Details product={p} />}
      </Show>
    </Show>
  );
}

function Details(props: { product: Product }) {
  const added = useSubmission(addToCart, ([form]) => form.get("product") === String(props.product.id));

  return (
    <div class="mx-auto flex max-w-360 flex-col gap-8 px-8 pt-12 pb-8">
      <Title>{`${props.product.name} · Mendwell`}</Title>
      <Meta name="description" content={props.product.description} />
      <article class="grid items-start gap-12 md:grid-cols-2">
        <ProductArt name={props.product.name} />
        <div class="flex flex-col gap-2.5">
          <a href={`/c/${props.product.category.slug}`} class="text-sm text-muted">
            {props.product.category.name}
          </a>
          <h1 class={`${heading} text-3xl`}>{props.product.name}</h1>
          <p class="flex items-center gap-2.5">
            <span class="text-3xl font-semibold tabular-nums">{money(props.product.priceCents)}</span>
            <Show when={props.product.stock === 0}>
              <SoldOut />
            </Show>
          </p>
          <p>{props.product.description}</p>
          <p class="text-muted">{stockLine(props.product.stock)}</p>
          <form action={addToCart} method="post" class="flex flex-col gap-1">
            <input type="hidden" name="product" value={props.product.id} />
            <button type="submit" class={primary} disabled={props.product.stock === 0}>
              Add to cart
            </button>
          </form>
          <Show when={added.result?.error ?? (added.error && "That wasn't added. Please try again.")}>
            {(message) => (
              <p role="alert" class="text-sm font-medium text-danger">
                {message()}
              </p>
            )}
          </Show>
          <p role="status" class="text-sm font-medium text-success">
            <Show when={!added.pending && added.result?.added}>In your cart.</Show>
          </p>
        </div>
      </article>
      <section aria-labelledby="related-title" class="flex flex-col gap-2.5">
        <h2 id="related-title" class={`${heading} text-xl`}>
          From the same aisle
        </h2>
        <Show when={props.product.related.length} fallback={<p class="text-muted">This is the only piece in its aisle for now.</p>}>
          <ul class={wideGrid}>
            <For each={props.product.related}>{(p) => <ProductCard product={p} />}</For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
