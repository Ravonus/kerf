import { Meta, Title } from "@solidjs/meta";
import { createAsync, useParams, useSubmission, type RouteDefinition } from "@solidjs/router";
import { For, Show } from "solid-js";

import { heading, primary } from "~/components/button";
import { grid, ProductArt, ProductCard } from "~/components/product-card";
import { NotFound } from "~/components/states";
import { addToCart, getProduct } from "~/lib/data";
import { money } from "~/lib/format";

export const route = { preload: ({ params }) => void getProduct(params.slug!) } satisfies RouteDefinition;

type Product = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

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
            <Title>Product not found · Commonplace</Title>
            <NotFound what="We don't carry that" />
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
  const lowStock = () => props.product.stock > 0 && props.product.stock < 5;

  return (
    <>
      <Title>{`${props.product.name} · Commonplace`}</Title>
      <Meta name="description" content={props.product.description} />
      <a href={`/c/${props.product.category.slug}`} class="text-sm font-medium text-muted hover:text-ink">
        ← {props.product.category.name}
      </a>
      <div class="mt-3 grid gap-6 md:grid-cols-2 md:gap-10">
        <ProductArt name={props.product.name} size={160} eager class="aspect-square rounded-2xl" />
        <div class="md:py-6">
          <h1 class={`${heading} text-3xl sm:text-4xl`}>{props.product.name}</h1>
          <p class="mt-2 text-xl tabular-nums">{money(props.product.priceCents)}</p>
          <p class="mt-4 leading-relaxed text-muted">{props.product.description}</p>
          <form action={addToCart} method="post" class="mt-6 flex flex-wrap items-center gap-3">
            <input type="hidden" name="product" value={props.product.id} />
            <button type="submit" class={primary} disabled={props.product.stock === 0}>
              Add to cart
            </button>
            <Show when={props.product.stock === 0}>
              <span class="text-sm text-muted">Out of stock</span>
            </Show>
            <Show when={lowStock()}>
              <span class="text-sm text-muted tabular-nums">{`Only ${props.product.stock} left`}</span>
            </Show>
          </form>
          <p role="status" class="mt-3 min-h-5 text-sm font-medium text-success">
            <Show when={!added.pending && added.result?.added}>Added to your cart.</Show>
          </p>
          <Show when={added.result?.error ?? (added.error && "That wasn't added. Please try again.")}>
            {(message) => (
              <p role="alert" class="text-sm font-medium text-danger">
                {message()}
              </p>
            )}
          </Show>
        </div>
      </div>
      <Show when={props.product.related.length}>
        <section aria-labelledby="related" class="mt-12">
          <h2 id="related" class={`${heading} text-2xl`}>
            You may also like
          </h2>
          <ul class={`${grid} mt-4`}>
            <For each={props.product.related}>{(p) => <ProductCard product={p} />}</For>
          </ul>
        </section>
      </Show>
    </>
  );
}
