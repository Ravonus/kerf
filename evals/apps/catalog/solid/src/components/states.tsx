import { HttpStatusCode } from "@solidjs/start";
import { ErrorBoundary, type JSX } from "solid-js";

import { heading, textLink } from "./button";

export function Failed(props: { reset: () => void }) {
  return (
    <div role="alert" class="py-20 text-center">
      <HttpStatusCode code={500} />
      <p class={`${heading} text-2xl`}>Something broke on our bench</p>
      <p class="mt-2 text-muted">Your cart is safe. Give it a minute and try again.</p>
      <button type="button" class={`${textLink} mt-3 cursor-pointer`} onClick={props.reset}>
        Try again
      </button>
    </div>
  );
}

export const Guarded = (props: { children: JSX.Element }) => (
  <ErrorBoundary fallback={(_, reset) => <Failed reset={reset} />}>{props.children}</ErrorBoundary>
);

export function NotFound() {
  return (
    <div class="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <HttpStatusCode code={404} />
      <h1 class={`${heading} text-3xl`}>Not on the shelves</h1>
      <p class="text-muted">That piece may be gone, or the address mistyped.</p>
      <a href="/" class={textLink}>
        Back to the aisles
      </a>
    </div>
  );
}
