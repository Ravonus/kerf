import { createAsync, useSubmissions } from "@solidjs/router";
import { Suspense } from "solid-js";

import { getCartCount, setQuantity } from "~/lib/data";

const link = "min-w-20 rounded-full border border-line px-3 py-1 text-center tabular-nums transition-colors hover:border-accent hover:text-accent-text";

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

// An add only counts once it's stored: a first add's cart exists when its cookie lands, and a reload can beat the reply.
function Count() {
  const count = createAsync(() => getCartCount());
  const steps = useSubmissions(setQuantity);
  const moving = () => [...steps].reduce((n, s) => n + (s.pending ? Number(s.input[0].get("change")) : 0), 0);
  return (
    <a href="/cart" class={link}>
      {`Cart (${(count() ?? 0) + moving()})`}
    </a>
  );
}
