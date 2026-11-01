import { Title } from "@solidjs/meta";
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
            <Title>Not on the shelves · Mendwell</Title>
            <NotFound />
          </>
        }
      >
        {(c) => {
          const pages = () => Math.max(1, Math.ceil(c().total / pageSize));
          const href = (page: number) => searchHref(params.slug!, search(), page);
          const filtered = () => search().min !== undefined || search().max !== undefined || search().stock;
          return (
            <div class="mx-auto flex max-w-360 flex-col gap-5 px-8 pt-12 pb-8">
              <Title>{`${c().name} · Mendwell`}</Title>
              <div class="flex flex-col gap-1">
                <a href="/" class="text-sm text-muted">
                  All aisles
                </a>
                <h1 class={`${heading} text-3xl`}>{c().name}</h1>
              </div>
              <nav aria-label="Aisles" class="flex gap-1 overflow-x-auto">
                <For each={c().categories}>
                  {(a) => (
                    <a
                      href={`/c/${a.slug}`}
                      aria-current={a.slug === params.slug ? "page" : undefined}
                      class="flex-none rounded-full border border-line px-2.5 py-1 aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-page"
                    >
                      {a.name}
                    </a>
                  )}
                </For>
              </nav>
              <div class="grid gap-12 md:grid-cols-[16rem_minmax(0,1fr)]">
                <Filters search={search()} />
                <div class="flex flex-col gap-5">
                  <p aria-live="polite" class="text-muted">{`${c().total.toLocaleString("en-US")} ${c().total === 1 ? "piece" : "pieces"}, lowest price first`}</p>
                  <Show
                    when={c().rows.length}
                    fallback={
                      <div class="flex flex-col items-start gap-1 py-12">
                        <h2 class={`${heading} text-xl`}>{filtered() ? "Nothing fits those filters" : "This aisle is empty for now"}</h2>
                        <p class="text-muted">{filtered() ? "Widen the price range, or include what's sold out." : "New pieces land here as soon as they're made."}</p>
                        <Show when={filtered()}>
                          <a href={`/c/${params.slug}`} class={textLink}>
                            Clear the filters
                          </a>
                        </Show>
                      </div>
                    }
                  >
                    <ul class={grid}>
                      <For each={c().rows}>{(p) => <ProductCard product={p} />}</For>
                    </ul>
                  </Show>
                  <Show when={pages() > 1}>
                    <nav aria-label="Pages" class="flex items-center justify-between gap-2.5">
                      <Show when={search().page > 1} fallback={<span aria-disabled="true" class="text-muted">Previous</span>}>
                        <a href={href(search().page - 1)} rel="prev" class={textLink}>
                          Previous
                        </a>
                      </Show>
                      <p class="text-muted">{`Page ${search().page} of ${pages()}`}</p>
                      <Show when={search().page < pages()} fallback={<span aria-disabled="true" class="text-muted">Next</span>}>
                        <a href={href(search().page + 1)} rel="next" class={textLink}>
                          Next
                        </a>
                      </Show>
                    </nav>
                  </Show>
                </div>
              </div>
            </div>
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
      class="flex flex-col gap-2.5 self-start md:sticky md:top-20"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <div class="grid grid-cols-2 gap-1">
        <label class="text-sm font-medium">
          <span class="mb-1 block">Min price</span>
          <input class={field} type="number" name="min" min="0" inputmode="numeric" placeholder="$0" value={props.search.min ?? ""} />
        </label>
        <label class="text-sm font-medium">
          <span class="mb-1 block">Max price</span>
          <input class={field} type="number" name="max" min="0" inputmode="numeric" placeholder="Any" value={props.search.max ?? ""} />
        </label>
      </div>
      <label class="flex items-center gap-2 text-sm font-medium">
        <input class="check" type="checkbox" name="stock" value="1" checked={props.search.stock} onChange={(e) => apply(e.currentTarget.form!)} />
        In stock only
      </label>
      <button type="submit" class={`${quiet} w-full`}>
        Apply
      </button>
    </form>
  );
}
