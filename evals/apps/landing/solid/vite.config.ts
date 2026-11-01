import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    solidStart(),
    tailwindcss(),
    nitro({
      // Nothing here reads per-request data, so these are built once and served as files.
      prerender: { routes: ["/", "/pricing", "/privacy", "/joined"], crawlLinks: false },
      compressPublicAssets: { gzip: true, brotli: true },
    }),
  ],
});
