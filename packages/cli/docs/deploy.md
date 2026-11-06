# Deploy: from `weft build` to a live URL

weft reads what the app uses and says which hosts can run it, before a build and before an account exists. Then it
writes the host's files and a workflow, and `weft deploy` runs the host's own CLI and reports the URL.

```bash
# Host fit, cost and suggestion
weft deploy hosts
# Host files, GitHub workflow and deploy config
weft deploy init
# Dry run: build and commands that --yes would run
weft deploy
# Preview; add --prod for production
weft deploy --yes
```

`weft deploy` without `--yes` runs nothing. An agent runs the dry run on its own, and asks before `--yes`: a deploy
publishes, and a host may bill for it. Nothing in weft creates a site, an app, a volume or a DNS record; `init` prints the
one command per host that does, for you to run.

## Which host

| The app uses | Netlify / Vercel | Cloudflare | Fly / Render |
|---|---|---|---|
| pages, queries, mutations, forms, `stream()` | ✓ | ✓ | ✓ |
| `channel`, `sharedState`, `realtime({ share })` | ✗ E001 | ✓ (Durable Objects) | ✓ |
| `.live({ required })`, `remote()` sidecars | ✗ E002 | ✗ E002 | ✓ |
| a SQLite file, media uploads | ✗ E003 | ✗ E003 | with a volume or disk (billed) |
| `changes` without an external listener | degraded (R014) | degraded | ✓ |

The suggestion: Netlify when nothing needs a server that stays up (a CDN with functions is the cheapest and fastest
host), Cloudflare when channels are all that need one, Fly when data must last on disk, else Fly or Render.

A function host blocked by a channel has a third way, the split: pages on the function host, realtime on a small server.
It needs a second origin and a cookie both can read, and is designed (research 46 §10), not built.

## `deploy` in weft.config.ts

```ts
deploy: {
  // netlify | vercel | cloudflare | fly | render
  target: 'fly',
  fly: {
    app: 'shop',
    region: 'iad',
    volume: { name: 'data', sizeGb: 1 },
  },
  ci: 'github', // the workflow; false for none
  branch: 'main',
  cdn: {
    proxy: 'cloudflare',
    images: { provider: 'cloudinary', cloud: 'shop' },
  },
}
```

Names, regions and sizes only. Every token comes from the environment, and one written into the config, a host file or a
workflow is **E008**. With `deploy.target` set, `weft build` builds for it, and `weft check` reports E001–E003 for it.

A volume or disk mounts at `/app/.data`: SQLite's default `file:.data/app.db` is already there, and uploads go to
`.data/media` (`WEFT_MEDIA_DIR`).

## What each target writes and runs

| Target | Files | `weft deploy --yes` runs | Reads |
|---|---|---|---|
| netlify | `netlify.toml` | `weft build --preset netlify`, `netlify deploy --dir dist --functions .netlify/functions-internal --json` | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` |
| vercel | `vercel.json` | `weft build --preset vercel`, `vercel deploy --prebuilt` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| cloudflare | `wrangler.toml` | `weft build --preset cloudflare_durable`, `wrangler deploy` in `.output/` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| fly | `fly.toml`, `Dockerfile`, `.dockerignore` | `flyctl deploy --remote-only` (Fly builds the image) | `FLY_API_TOKEN` |
| render | `render.yaml`, `Dockerfile`, `.dockerignore` | the deploy hook (Render builds the pushed commit) | `RENDER_DEPLOY_HOOK_URL` |

Every target also gets `.github/workflows/weft-deploy.yml`: on push to `branch`, install, `weft check`, then `weft deploy
--yes --prod`; on a pull request, a preview where the host has them. Add the variables as repository secrets (`gh secret
set NAME`). Netlify, Vercel and Cloudflare deploy what was built, so build where the host runs: the workflow builds on
Linux, and a native addon built on a Mac is **E004**.

Each written file starts with `# weft deploy init <target>, sha <hash>`. Change the config and `weft check` reports the
file as stale (**E006**); `init` rewrites it. A file you edited keeps its old hash, and `init` leaves it alone unless
`--force`.

## CDN and media

- **Cloudflare in front of a server host** (`cdn.proxy: 'cloudflare'`): proxy the domain to the Fly or Render origin.
  Hashed assets are already `immutable`, and pages are `private` unless a route caches, so the proxy can't serve one
  user's page to another. E010: `site.url` is still the host's own domain. E011: a proxy in front of a CDN host.
- **Cloudinary for uploads** (`cdn.images`): checked (E012 without `@weft-js/plugin-media`, E013 without a cloud or with
  two), not yet wired: uploads still go to the media server's disk (E014). `?media` imports never need it: the build
  already makes sized AVIF and WebP files that any CDN serves.

## Codes

E001 sockets on a function host, E002 a held process or a sidecar, E003 data on a disk that doesn't last, E004 a native
addon deployed from another OS, E005 no target (with the suggestion), E006 a stale host file, E007 an unset variable,
E008 a written credential, E009 the memory bus on many instances, E010–E014 CDN and media. `weft docs E003` explains one.


## Indexing intent

For a site intended for public search, declare
`build: { audit: { indexing: 'public' } }`. L024 then fails the build or audit if
robots metadata or an HTTP X-Robots-Tag header says noindex. `private` or the
backward-compatible `auto` leaves this a warning; neither removes a directive.
After deployment, run `weft audit --url https://your-site.example --indexing public`:
a host or proxy may add a header that a local build cannot see. Preserve intentional
preview/private exclusions. A noindex finding is an indexing policy issue, not
chat-agent traffic; use a clean profile before attributing other audit failures
to application or framework code.
