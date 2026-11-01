import { A, useSearchParams } from "@solidjs/router";
import { Show } from "solid-js";

import { secondary } from "~/components/button";
import { Seo } from "~/components/seo";
import { WaitlistForm } from "~/components/waitlist-form";

/** Where a form post without the router lands: rendered per request, as the home page isn't. */
export default function Waitlist() {
  const [params] = useSearchParams();
  const joined = () => params.status === "joined";
  return (
    <section class="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Seo title="Waitlist · Emberline" description="Join the Emberline waitlist." />
      <Show
        when={joined()}
        fallback={
          <>
            <h1 class="mb-6 text-4xl font-extrabold tracking-tight">Join the waitlist</h1>
            <WaitlistForm error={params.status === "invalid" ? "That doesn't look like an email address." : undefined} />
          </>
        }
      >
        <h1 class="text-4xl font-extrabold tracking-tight">You're on the list</h1>
        <p class="mt-3 mb-8 text-lg text-muted">We'll send one email when your spot opens.</p>
        <A href="/" class={secondary} activeClass="" inactiveClass="">
          Back to home
        </A>
      </Show>
    </section>
  );
}
