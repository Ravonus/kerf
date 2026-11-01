import { ErrorBoundary, For, Suspense, type JSX } from "solid-js";

import { panel } from "./button";

export function Rows(props: { count?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={props.label} class={`${panel} animate-pulse p-4`}>
      <For each={Array.from({ length: props.count ?? 8 })}>{() => <div class="my-3 h-5 rounded-md bg-sunken" />}</For>
    </div>
  );
}

/** One region of a page: it loads and fails on its own, and the rest of the page carries on. */
export function Loads(props: { what: string; fallback?: JSX.Element; children: JSX.Element }) {
  return (
    <ErrorBoundary
      fallback={(_, reset) => (
        <div role="alert" class={`${panel} p-6 text-sm`}>
          <p class="font-medium text-danger">{props.what} didn't load.</p>
          <button type="button" class="mt-2 cursor-pointer font-semibold text-accent-text underline underline-offset-4" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    >
      <Suspense fallback={props.fallback ?? <Rows label={`Loading ${props.what.toLowerCase()}`} />}>{props.children}</Suspense>
    </ErrorBoundary>
  );
}
