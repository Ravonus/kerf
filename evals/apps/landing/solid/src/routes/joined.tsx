import { A } from "@solidjs/router";

import { secondary } from "~/components/button";
import { Seo } from "~/components/seo";

export default function Joined() {
  return (
    <section class="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
      <Seo title="You're on the list · Emberline" description="Your place on the Emberline waitlist is saved." />
      <h1 class="text-4xl font-extrabold tracking-tight sm:text-5xl">You're on the list</h1>
      <p class="mt-4 mb-8 text-lg text-muted">We'll write when your place in line comes up. Everyone hears from us in the order they joined.</p>
      <A href="/pricing" class={secondary} activeClass="" inactiveClass="">
        See pricing
      </A>
    </section>
  );
}
