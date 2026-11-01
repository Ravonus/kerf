// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

import figtree from "~/assets/fonts/figtree-latin-wght.woff2?url";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="description" content="A short list of what to do next." />
          <link rel="icon" href="/icon.svg" type="image/svg+xml" />
          <link rel="preload" as="font" type="font/woff2" href={figtree} crossorigin="anonymous" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
