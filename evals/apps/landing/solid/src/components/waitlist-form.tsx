import { useSubmission } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";

import { joinWaitlistAction } from "~/lib/actions";
import { primary } from "./button";

export function WaitlistForm(props: { error?: string }) {
  const submission = useSubmission(joinWaitlistAction);
  // Until the router has the form, a submit is a plain document post, JavaScript on or off.
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));

  const error = () => submission.result?.error ?? props.error;

  return (
    <div class="w-full max-w-md" id="join">
      <form action={joinWaitlistAction} method="post" class="flex flex-col gap-2 sm:flex-row" aria-busy={submission.pending}>
        <Show when={!hydrated()}>
          <input type="hidden" name="native" value="1" />
        </Show>
        <label for="email" class="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autocomplete="email"
          inputmode="email"
          placeholder="you@company.com"
          aria-invalid={error() ? true : undefined}
          aria-describedby="join-note"
          class="min-h-11 min-w-0 flex-1 rounded-xl bg-surface px-4 text-base text-ink ring-1 ring-line placeholder:text-muted focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <button type="submit" class={primary} disabled={submission.pending}>
          Join
        </button>
      </form>
      <div role="status" id="join-note" class="mt-3 min-h-6 text-sm">
        <span class={error() ? "font-medium text-danger" : "text-muted"}>{error() ?? "We'll write when your place comes up, and not before."}</span>
      </div>
    </div>
  );
}
