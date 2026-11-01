import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";

import { SiteFooter, SiteHeader } from "~/components/chrome";

import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <a
            href="#main"
            class="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-20 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
          >
            Skip to content
          </a>
          <div class="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" class="flex-1">
              <Suspense>{props.children}</Suspense>
            </main>
            <SiteFooter />
          </div>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
