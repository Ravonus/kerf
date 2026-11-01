import { Meta, Title } from "@solidjs/meta";
import { createAsync, useParams, useSearchParams, type RouteDefinition } from "@solidjs/router";
import { createMemo, For, Show } from "solid-js";

import { field, heading, quiet, textLink } from "~/components/button";
import { grid, ProductCard } from "~/components/product-card";
import { NotFound } from "~/components/states";
import { getCategory } from "~/lib/data";
import { pageSize, parseSearch, searchHref, type ProductSearch } from "~/lib/search";

export const route = {
  preload: ({ params, location }) => void getCategory(params.slug!, parseSearch(location.query)),
} satisfies RouteDefinition;

export default function Category() {
  const params = useParams();
  const [query] = useSearchParams();
  const search = createMemo(() => parseSearch(query));
  // Deferred because an unknown category has to answer 404, and a status can't change once the first byte is out.
  const category = createAsync(() => getCategory(params.slug!, search()), { deferStream: true });

  return (
    <Show when={category() !== undefined}>
      <Show
        when={category()}
        fallback={
          <>
            <Title>Category not found · Commonplace</Title>
            <NotFound what="No such category" />
          </>
        }
      >
        {(c) => {
          const pages = () => Math.max(1, Math.ceil(c().total / pageSize));
          const href = (page: number) => searchHref(params.slug!, search(), page);
          return (
            <>
              <Title>{`${c().name} · Commonplace`}</Title>
              <Meta name="description" content={`Shop ${c().name.toLowerCase()} at Commonplace: dependable pieces, made to last.`} />
              <a href="/" class="text-sm font-medium text-muted hover:text-ink">
                ← All categories
              </a>
              <div class="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                <h1 class={`${heading} text-3xl sm:text-4xl`}>{c().name}</h1>
                <p class="text-sm text-muted tabular-nums">{`${c().total.toLocaleString("en-US")} ${c().total === 1 ? "product" : "products"}`}</p>
              </div>
              <Filters search={search()} />
              <Show
                when={c().rows.length}
                fallback={
                  <div class="py-16 text-center">
                    <p class={`${heading} text-xl`}>Nothing matches those filters</p>
                    <a href={`/c/${params.slug}`} class={`${textLink} mt-2 inline-block text-sm`}>
                      Clear filters
                    </a>
                  </div>
                }
              >
                <ul class={`${grid} mt-5`}>
                  <For each={c().rows}>{(p) => <ProductCard product={p} />}</For>
                </ul>
              </Show>
              <Show when={pages() > 1}>
                <nav aria-label="Pages" class="mt-8 flex items-center justify-between gap-3 text-sm">
                  <Show when={search().page > 1} fallback={<span />}>
                    <a href={href(search().page - 1)} rel="prev" class={quiet}>
                      Previous
                    </a>
                  </Show>
                  <span class="text-muted tabular-nums">{`Page ${search().page} of ${pages().toLocaleString("en-US")}`}</span>
                  <Show when={search().page < pages()} fallback={<span />}>
                    <a href={href(search().page + 1)} rel="next" class={quiet}>
                      Next
                    </a>
                  </Show>
                </nav>
              </Show>
            </>
          );
        }}
      </Show>
    </Show>
  );
}

/** A plain GET form, so filters work before hydration too. Once hydrated, they navigate in place. */
function Filters(props: { search: ProductSearch }) {
  const [, setQuery] = useSearchParams();
  const apply = (form: HTMLFormElement) => {
    const { min, max, stock } = form.elements as unknown as Record<"min" | "max" | "stock", HTMLInputElement>;
    setQuery({ min: min.value || undefined, max: max.value || undefined, stock: stock.checked ? "1" : undefined, page: undefined });
  };
  return (
    <form
      method="get"
      aria-label="Filters"
      class="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <label class="w-28 text-sm font-medium">
        <span class="mb-1 block">Min price</span>
        <input class={field} type="number" name="min" min="0" step="1" inputmode="numeric" placeholder="$0" value={props.search.min ?? ""} />
      </label>
      <label class="w-28 text-sm font-medium">
        <span class="mb-1 block">Max price</span>
        <input class={field} type="number" name="max" min="0" step="1" inputmode="numeric" placeholder="Any" value={props.search.max ?? ""} />
      </label>
      <label class="flex h-10 items-center gap-2 text-sm font-medium">
        <input class="check" type="checkbox" name="stock" value="1" checked={props.search.stock} onChange={(e) => apply(e.currentTarget.form!)} />
        In stock only
      </label>
      <button type="submit" class={quiet}>
        Apply
      </button>
    </form>
  );
}
