import { createAsync, useSubmissions } from "@solidjs/router";
import { Suspense } from "solid-js";

import { addToCart, getCartCount } from "~/lib/data";

const link = "rounded-lg px-3 py-2 text-sm font-semibold tabular-nums transition-colors hover:bg-sunken";

/** Behind its own Suspense: the page never waits for a visitor's cart. */
export function CartLink() {
  return (
    <Suspense
      fallback={
        <a href="/cart" class={link}>
          Cart
        </a>
      }
    >
      <Count />
    </Suspense>
  );
}

function Count() {
  const count = createAsync(() => getCartCount());
  const adds = useSubmissions(addToCart);
  const adding = () => [...adds].filter((s) => s.pending).length;
  return (
    <a href="/cart" class={link}>
      {`Cart (${(count() ?? 0) + adding()})`}
    </a>
  );
}
