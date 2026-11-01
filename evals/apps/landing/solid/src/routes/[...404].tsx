import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";

import { secondary } from "~/components/button";
import { Seo } from "~/components/seo";

export default function NotFound() {
  return (
    <section class="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <Seo title="Not found · Emberline" description="This page doesn't exist." />
      <HttpStatusCode code={404} />
      <h1 class="mb-6 text-4xl font-extrabold tracking-tight">Page not found</h1>
      <A href="/" class={secondary} activeClass="" inactiveClass="">
        Back to home
      </A>
    </section>
  );
}
