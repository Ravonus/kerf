import { HttpStatusCode } from "@solidjs/start";

import { Container } from "~/components/ui";
import { Seo } from "~/components/site/seo";
import { SiteFooter, SiteHeader, SkipLink } from "~/components/site/site-chrome";

export default function NotFound() {
  return (
    <>
      <Seo title="Not found" />
      <HttpStatusCode code={404} />
      <SkipLink />
      <SiteHeader />
      <main id="main" class="py-16 sm:py-24">
        <Container size="reading">
          <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Page not found</h1>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
