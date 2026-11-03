# 46. Deploy: host fit, `weft deploy`, push pipelines, CDN and media

Status: **design written before the code, 2026-11-03; §13 records what was built.** Inputs: [28](28-db-auth-runtimes.md)
§5 (runtimes and presets), [30](30-realtime.md) and [32](32-channels.md) (what a live connection needs from a host),
[36](36-rust-remote.md) (sidecars), [15](15-assets.md) and [29](29-forms-state-media.md) §6 (media), and the docs site,
which runs a chat demo on Netlify that can't work there.

The rule: **an app should not reach a host that can't run it.** Today `weft build --preset netlify` builds a chat app
that ships, loads, and then never connects. R002 catches a memory bus, and its fix (a Redis or Postgres bus) doesn't
help: the problem is the socket, not the bus. What a host can run is knowable from the app's own files, before a build
and before an account exists, so weft says it as a diagnostic with the fix, and picks the host when asked.

## 1. What's there

- **Presets.** `weft build --preset <p>` passes a Nitro preset through (`packages/start/src/app.mjs`). `runtime` in the
  config picks `node`, `bun` or `deno_server` when there's none.
- **What a preset can hold.** `liveTarget(preset)` in `live-target.mjs`: `held` is a process that outlives a request.
  `holdsSockets(preset)` adds Durable Objects and Deno Deploy. R013 and R014 use the first, R024 (a channel on a host
  that can't hold a socket, reported by the client and the server as `unavailable`) the second, through the
  `__WEFT_SOCKETS__` define.
- **R002** (memory bus on a multi-instance preset), **R104** (`native()` with no file system), **R020** (a password in
  source).
- **Where data sits.** SQLite is a file. `@weft-js/plugin-media`'s server writes uploads to `server.dir` (`.weft/media`).
  A remote Rust sidecar is a second process `weft start` launches next to the server.
- **No deploy.** Nothing writes a host's config, a CI workflow, or reports a URL. The docs site was put on Netlify by
  hand, with `netlify deploy`.

## 2. What an app needs from a host

Each need is read from files, cheaply: no Vite server, no build. `.weft/contract.json` is used when it's there and
newer than `src/`; otherwise a source scan finds the same thing (the scans `weft check` already does).

| Need | Read from | Held process | Sockets | Lasting disk | Second process |
|---|---|---|---|---|---|
| `channel` / `sharedState` / `share` | contract kinds `channel`, `shared`; else `channel(`/`sharedState(` in server modules | | yes | | |
| `.live({ required })` or `live: { required }` | `scanRequired` | yes (or an external listener) | | | |
| `changes` without `listener: 'external'` | `src/realtime.server.ts` | yes, else degraded | | | |
| memory bus with streams, live or channels | `realtime.server.ts` has no `*Bus(` | one instance | | | |
| `remote()` sidecar | `usesRemote`, not `rust.services.<s>.external` | | | | yes |
| `native()` | contract `services` kind `native`, or `native(` | file system | | | |
| SQLite file | `src/db/index.server.ts` imports `db/sqlite`, or `drizzle.config.ts` says `sqlite` with a file URL | | | yes | |
| media uploads | `@weft-js/plugin-media` in plugins and `ctx.media` in source, or `encoder: 'server'` | | | yes | |
| native npm addons | `better-sqlite3`, `sharp`, `bcrypt`, `argon2`, `canvas`, `sqlite3`, `@node-rs/*` in dependencies | | | | |

A stream (`stream()`, SSE) is not a need: every host carries one, and a function host ends it at its time limit, where
the client resumes from its cursor (research 30 §4). A function host's live data is still updated by the app's own
mutations, so `changes` there is a warning (R014), never a block.

## 3. Hosts

One table in `packages/cli/src/deploy/hosts.mjs`, which both the fit and the generators read.

| Host | Kind | Preset | Sockets | Held | Disk | Sidecar | Instances | Cost, as of 2026-11 |
|---|---|---|---|---|---|---|---|---|
| Netlify | functions | `netlify` | no | no | none | no | many | free tier; usage is billed in credits past it |
| Vercel | functions | `vercel` | no | no | none | no | many | Hobby is free for non-commercial use; Pro per seat |
| Cloudflare | workers + Durable Objects | `cloudflare_durable` | yes (DO) | no | none | no | many | free tier includes Workers and SQLite-backed DOs |
| Fly.io | server (container) | runtime's server preset | yes | yes | volume (paid) | yes | `min_machines_running` | pay as you go, no free tier for new orgs |
| Render | server (container) | runtime's server preset | yes | yes | disk on paid plans | yes | 1 unless scaled | free instance sleeps after 15 idle minutes, no disk |
| AWS | §11 | | | | | | | |

Fly and Render get the plain server preset (`node`, `bun`, `deno_server`), not Nitro's `render_com`: the image is the
same `weft start` either way, and R002's preset regex then doesn't misfire on a single Render instance. The deploy
layer knows the instance count from the config it generated, so it reports the memory bus itself (E009).

Prices change: the table's cost column is a one-line hint that `weft deploy hosts` prints next to each fit, with the
host's pricing link. weft never says "free" without "tier", and never creates anything that bills (§8).

## 4. Fit and suggestion

`fit(needs, host)` returns `{ fits, blockers, warnings }`. A blocker is a need the host can't meet at all, with the
code and fix. A warning is one it meets degraded, or one that needs a paid add-on (a Fly volume, a Render disk).

The suggestion, for `weft deploy hosts`, `weft doctor` and E005:

1. Nothing held, no sockets, no disk, no sidecar: **Netlify or Vercel**. A CDN with functions behind it is the cheapest
   and fastest thing that runs the app. Netlify first, as the user asked, Vercel next.
2. Sockets and nothing else held: **Cloudflare** (`cloudflare_durable`) when the bus is `durableObjectBus` or the
   memory bus, since a Durable Object is the room; otherwise **Fly or Render**.
3. A held process, a sidecar or a lasting disk: **Fly or Render**. Fly when there's a disk (a volume is per machine and
   cheap), Render when the free tier's sleep is acceptable and there's no disk.
4. Always, when a function host was configured and blocked: **the split**, as an option, not a suggestion: pages on the
   function host, `/_weft/ws` and `/_weft/rt` on a small server (§10). Its cost is a second deploy and a second origin.

## 5. The config

```ts
export default defineConfig({
  deploy: {
    target: 'fly',                 // netlify | vercel | cloudflare | fly | render
    fly: { app: 'my-app', region: 'iad', volume: { name: 'data', path: '/data', sizeGb: 1 } },
    netlify: { site: 'my-site' },  // a name or id: not a secret
    vercel: { project: 'my-app' },
    render: { service: 'my-app', plan: 'starter', region: 'oregon', disk: { path: '/data', sizeGb: 1 } },
    cloudflare: { name: 'my-app' },
    ci: 'github',                  // or false: no workflow
    branch: 'main',                // what the workflow deploys on push
    cdn: {
      proxy: 'cloudflare',         // Cloudflare in front of a server host's origin
      images: { provider: 'cloudinary', cloud: 'my-cloud' },
    },
  },
})
```

`--preset` still wins for a build. `weft build` with no `--preset` and a `deploy.target` builds for that target.
Everything in `deploy` is a name, a region or a size: the schema refuses a value that looks like a token (E008), so a
config never holds a secret.

## 6. Commands

- **`weft deploy hosts`** (also in `weft doctor`): every host, whether it fits, why not, the cost hint, and which one
  weft suggests. Read-only, under a second.
- **`weft deploy init [target]`**: writes the host's files (§7) and, with `ci: 'github'`, the workflow. With no target,
  the suggested one. Sets `deploy.target` in the config the way `weft add` edits `plugins`. Refuses a target the app
  doesn't fit (E001–E003) unless `--unsafe-allow`. `--dry-run` lists what it would write. It never overwrites a file it
  didn't write, or one whose hash says it was edited since.
- **`weft deploy [--prod]`**: fit check, `weft build --preset <target's>`, then the host's own CLI on the output.
  **Without `--yes` it is a dry run**: it prints the build and the exact commands it would run, and which env vars they
  read, and stops. With `--yes` it runs them and reports the live URL, from the CLI's JSON where there is one (Netlify,
  Vercel), else from the config (Fly's `https://<app>.fly.dev`, Render's `https://<service>.onrender.com`). A preview
  deploy is the default; `--prod` is production. An agent can run the dry run on its own and must ask before `--yes`.

| Target | Build output | Deploy | Reads |
|---|---|---|---|
| netlify | `dist/`, `.netlify/functions-internal/` | `netlify deploy --dir dist --functions .netlify/functions-internal --json [--prod]` | `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID` (or `deploy.netlify.site`) |
| vercel | `.vercel/output/` | `vercel deploy --prebuilt [--prod] --yes` | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |
| cloudflare | `.output/` with Nitro's `server/wrangler.json` | `wrangler deploy` in `.output` | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| fly | the image (Dockerfile) | `flyctl deploy --remote-only` | `FLY_API_TOKEN` |
| render | the image, built by Render from the pushed commit | `POST $RENDER_DEPLOY_HOOK_URL` | `RENDER_DEPLOY_HOOK_URL` |

Fly and Render build the image themselves (Fly's remote builder, Render from git), so a Linux addon is built on Linux
and no Docker is needed here. Netlify, Vercel and Cloudflare deploy what was built locally: from a Mac, a native addon
would be the Mac's (E004), which is why the workflow builds on `ubuntu-latest`.

## 7. Generated files

| Target | Files |
|---|---|
| netlify | `netlify.toml` (`build.command = "npx weft build --preset netlify"`, `publish = "dist"`), so a git-connected site builds the same way |
| vercel | `vercel.json` (`buildCommand`, `framework: null`, output from the Build Output API) |
| cloudflare | none: Nitro writes `wrangler.json` into the output |
| fly | `fly.toml`, `Dockerfile`, `.dockerignore` |
| render | `render.yaml` (a Blueprint), `Dockerfile`, `.dockerignore` |
| all, `ci: 'github'` | `.github/workflows/weft-deploy.yml`: on push to `branch`, `weft check`, then `weft deploy --prod --yes`; on a pull request, a preview deploy where the host has previews |

Each text file starts with `# weft deploy init <target>, sha <hash>`: the hash of what follows. `weft check` compares it.
A file whose hash matches, but which differs from what `init` would write now (the config changed), is stale: E006,
with `weft deploy init` as the fix. A file whose hash doesn't match was edited: weft leaves it alone and says so in
`weft deploy init`, never as a diagnostic. `vercel.json` can't hold a comment, so only its `buildCommand` is checked.

The Dockerfile is two stages on `node:26-slim` (weft needs Node 26): install with the lockfile's manager, `weft build
--preset <runtime's>`, then copy `.output` (sidecars ship inside it) and run `weft start`'s command directly. A
`--runtime bun` app gets `oven/bun`, Deno gets `denoland/deno`.

## 8. Secrets and approval

- Tokens only from the environment. `weft deploy` names the variables it reads, and stops with E007 when one is unset,
  with the host's page for making one. It never writes one: not to the config, the generated files or `.env`.
- The workflow reads them from GitHub's secrets (`${{ secrets.NETLIFY_AUTH_TOKEN }}`). `weft deploy init` lists which
  to add, and doesn't add them: `gh secret set` is the user's to run.
- E008: a token-shaped literal (`nfp_…`, `vercel_…`, `fo1_…`, a Cloudflare 40-character token next to `token`, a
  Cloudinary `cloudinary://key:secret@`) in the config, a generated file or the workflow. R020 covers connection
  strings in source; E008 is the same rule for deploy credentials.
- Nothing creates a site, an app, a volume or a DNS record. `init` writes files; creating the host's project is one
  command the user runs (`netlify sites:create`, `flyctl apps create`, Render's Blueprint button), and `init` prints it.

## 9. CDN and media

**Cloudflare as a CDN** (`cdn.proxy: 'cloudflare'`) is for a server host: the origin is Fly or Render, the domain is
proxied by Cloudflare. weft's part is headers and checks, not DNS:

- Server hosts already send `cache-control` for hashed assets (`immutable`); pages send `private, no-store` unless a
  route's cache says otherwise, so a proxy can't cache a signed-in page. Nothing new is needed for correctness.
- E010 (warning): `cdn.proxy` set and `site.url` is the host's own domain (`*.fly.dev`, `*.onrender.com`): the proxy
  isn't in front of anything. E011 (warning): a function host with `cdn.proxy`: Netlify and Vercel are CDNs already,
  and a second one in front breaks their cache invalidation on deploy.
- Purge on deploy (a call with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID`) is designed, not built (§11).

**Cloudinary for images** (`cdn.images: { provider: 'cloudinary', cloud }`) is for uploads, not for `?media` imports,
which the build already turns into sized AVIF and WebP files that any CDN serves. Uploads on a function host have no
lasting disk (E003); Cloudinary is the fix that doesn't need a server.

- E012 (error): `cdn.images` set without `@weft-js/plugin-media` in `plugins`: nothing would send it a file.
- E013 (error): `CLOUDINARY_URL` unset where the server needs it (a deploy, `weft doctor` with `--target`), or a
  `cloud` that doesn't match the one in `CLOUDINARY_URL`.
- The upload path itself (a `media.server` provider that stores to Cloudinary instead of `server.dir`) is in
  `@weft-js/plugin-media` and is §11's first item: the slot exists, the provider doesn't.

## 10. The split

Pages on a function host, realtime on a server: `deploy: { target: 'netlify', realtime: { target: 'fly' } }`. The client
dials `/_weft/ws` on the realtime origin, `realtime({ origins })` lists the pages' origin, and the session cookie must
reach both (one registrable domain, `SameSite=Lax`). It touches `link.ts`, `channel.ts` and the auth cookie, so it is
designed here and not built in this pass. `weft deploy hosts` names it as the option for a blocked function host.

## 11. Left out

- **AWS.** Nitro has `aws_lambda` and `aws_amplify`, and a server goes on App Runner or ECS. None of them deploys from one
  command without IAM roles, an ECR repository or an Amplify app made first, and each of those is a billed resource weft
  would be making. `aws` is in the host table as a fit (Lambda is a function host, App Runner a server), and `init` for
  it is the next target after this pass: Amplify Hosting's `amplify.yml` for functions, the same Dockerfile as Fly's for
  App Runner.
- The split (§10). Cloudinary's upload provider (§9). Cloudflare purge on deploy (§9). Custom domains and DNS.
- Database provisioning: a hosted Postgres (Neon, Supabase), Turso for SQLite, Netlify Database (credit-billed). The fit
  says "SQLite needs a lasting disk" and names them; it doesn't make one.

## 12. Diagnostics

| Code | Severity | Where | Catches |
|---|---|---|---|
| E001 | error | `weft check`, `weft deploy`, `init` | `deploy.target` can't hold a socket and the app has a `channel`, `sharedState` or `share` (at runtime: R024) |
| E002 | error | same | `deploy.target` can't run what needs a held process: a required live query (R013), or a `remote()` sidecar |
| E003 | error | same | Data on local disk (a SQLite file, media uploads) on a target whose disk doesn't last, or without the volume or disk it needs |
| E004 | warning | `weft deploy` | Native npm addons, built on this OS, deployed to Linux functions from here |
| E005 | info | `weft doctor`, `weft deploy hosts` | No `deploy.target`: which hosts fit, and the suggestion (not `weft check`: every app without a target would carry it) |
| E006 | warning | `weft check` | A generated host file or workflow is missing or stale against the config |
| E007 | error | `weft deploy --yes` | A variable the deploy reads is unset |
| E008 | error | `weft check` | A token-shaped literal in the config, a host file or the workflow |
| E009 | warning | same | The memory bus on a target configured for more than one instance |
| E010 | warning | same | `cdn.proxy` with `site.url` on the host's own domain |
| E011 | warning | same | `cdn.proxy` in front of a function host that is a CDN already |
| E012 | error | same | `cdn.images` without `@weft-js/plugin-media` |
| E013 | error | `weft check`, `weft deploy` | `cdn.images` with neither `cloud` nor `CLOUDINARY_URL`, or the two naming different clouds; a warning at a deploy when only the env var is unset |
| E014 | info | same | `cdn.images` is checked and not wired: uploads still go to `server.dir` |

## 13. As built (2026-11-03)

- **Where.** `packages/cli/src/deploy/`: `hosts.mjs` (the table), `needs.mjs` (one pass over `src/`, the config, `package.json`
  and a fresh `contract.json`), `fit.mjs` (fit and suggestion), `files.mjs` (generators, stamps, states), `cdn.mjs` (E008,
  E010–E014), `index.mjs` (the commands, and `deployChecks` for `weft check`). `weft docs deploy` is the agent page.
- **Existing codes where they exist.** The fit reports R104 (`native()` on Workers) and R014 (`changes` on a function host)
  under their own codes, and E001 and E002 cite R024 and R013, so one finding has one name at check, build and runtime.
- **`needs.mjs` doesn't load `@weft-js/start`.** `usesRemote` and `scanRequired` live there, behind modules that import
  Vite; the deploy scan is a few regexes over the same files, so `weft deploy hosts` stays under a second on the docs site.
- **E004 needs the build to happen here.** Fly and Render build the image themselves, so the fit gives E004 only for a
  prebuilt host deployed with `CI` unset on a machine that isn't Linux.
- **E007 splits tokens from ids.** A missing token is a warning locally, where the host CLI's own login stands in, and an
  error in CI. A missing id (`NETLIFY_SITE_ID`, Vercel's org and project) is an error unless the project is linked
  (`.netlify/state.json`, `deploy.netlify.site`, `.vercel/project.json`). `RENDER_DEPLOY_HOOK_URL` is always needed.
- **A server host is production only.** Fly and Render have no preview deploys, so `weft deploy` asks for `--prod` there,
  and their workflow has no `pull_request` trigger. Render's Blueprint sets `autoDeploy: false`, so a push deploys only
  once `weft check` passed, through the hook.
- **One Fly machine when it must be one.** `flyctl deploy --ha=false` when the bus is the memory bus or there's a volume.
  `min_machines_running` is 1 when something listens (a feed, a sidecar), else 0, so an idle app stops.
- **`init` writes `deploy` when the config has none**, with names from `package.json` and a volume or disk when the app
  keeps data on disk, so the first `init` on a SQLite app fits Fly without a second step. A config that already has
  `deploy` is read, never edited.
- **The host CLI** runs from `PATH`, else `npx --yes netlify-cli | vercel | wrangler` (unpinned: the host's current CLI);
  flyctl isn't on npm, and the workflow installs it with `superfly/flyctl-actions/setup-flyctl`.
- **The docs site** (`weft deploy hosts --root site`): Netlify, Vercel and AWS Lambda are out on E001 for `src/server/chat.ts`;
  Cloudflare fits once the bus is `durableObjectBus` (E009 until then); weft suggests Fly, with Render next.

Not built, in order: Cloudinary's upload provider in `@weft-js/plugin-media` (then E003 for uploads on a function host
has a fix that isn't a server), the split (§10), AWS (`amplify.yml` for Lambda, the Dockerfile on App Runner), Cloudflare
purge on deploy, custom domains. None of the generated files was run against a real account in this pass: each deploy is
the host's documented command, and the tests drive them with the CLI faked.
