import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";

import { secondary } from "~/components/button";
import { Seo } from "~/components/seo";

export default function NotFound() {
  return (
    <section class="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Seo title="Page not found · Emberline" description="This page doesn't exist." />
      <HttpStatusCode code={404} />
      <h1 class="text-4xl font-extrabold tracking-tight">We can't find that page</h1>
      <p class="mt-4 mb-6 text-lg text-muted">The link may be old, or the address mistyped.</p>
      <A href="/" class={secondary} activeClass="" inactiveClass="">
        Back to the home page
      </A>
    </section>
  );
}
