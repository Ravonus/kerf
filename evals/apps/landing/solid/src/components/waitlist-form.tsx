import { useSubmission } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";

import { joinWaitlistAction } from "~/lib/actions";
import { primary } from "./button";
import { Check } from "./icons";

export function WaitlistForm(props: { error?: string }) {
  const submission = useSubmission(joinWaitlistAction);
  // Until the router has the form, a submit is a plain document post, JavaScript on or off.
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));

  const reply = () => submission.result;
  const error = () => (reply() && "error" in reply()! ? (reply() as { error: string }).error : props.error);
  const joined = () => !submission.pending && !!reply() && "joined" in reply()!;

  return (
    <div class="w-full max-w-md" id="join">
      <Show when={!joined()}>
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
      </Show>
      <div role="status" id="join-note" class="mt-3 min-h-6 text-sm">
        <Show
          when={joined()}
          fallback={
            <span class={error() ? "font-medium text-danger" : "text-muted"}>
              {error() ?? "Early access is free. One email when your spot opens."}
            </span>
          }
        >
          <span class="flex items-center gap-2 text-base font-semibold">
            <Check class="size-5 text-accent-text" />
            You're on the list
          </span>
        </Show>
      </div>
    </div>
  );
}
