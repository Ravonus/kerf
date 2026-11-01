import { HttpStatusCode } from "@solidjs/start";
import { ErrorBoundary, type JSX } from "solid-js";

import { heading, textLink } from "./button";

export function Failed(props: { reset: () => void }) {
  return (
    <div role="alert" class="py-20 text-center">
      <HttpStatusCode code={500} />
      <p class={`${heading} text-2xl`}>This page didn't load.</p>
      <button type="button" class={`${textLink} mt-3 cursor-pointer`} onClick={props.reset}>
        Try again
      </button>
    </div>
  );
}

export const Guarded = (props: { children: JSX.Element }) => (
  <ErrorBoundary fallback={(_, reset) => <Failed reset={reset} />}>{props.children}</ErrorBoundary>
);

export function NotFound(props: { what: string }) {
  return (
    <div class="py-20 text-center">
      <HttpStatusCode code={404} />
      <h1 class={`${heading} text-3xl`}>{props.what}</h1>
      <p class="mt-2 text-muted">It may have sold through, or the address is mistyped.</p>
      <a href="/" class={`${textLink} mt-4 inline-block`}>
        Back to the shop
      </a>
    </div>
  );
}
