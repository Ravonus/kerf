<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">Lemonstand</h1>

<p align="center">
  <strong>A real marketing site measured in three stacks: Next, Kerf and SolidStart.</strong><br>
  Animated hero, audience tabs, a coach demo, two forms and two legal pages. No page reads the database while rendering.
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#the-variants">Variants</a> ·
  <a href="#latest-numbers">Latest numbers</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!NOTE]
> This is a private benchmark app, not a published package. Nothing here is on npm. Only the SolidStart version lives in
> this folder; the Next and Kerf versions are separate checkouts outside the repository.

Lemonstand is the one app in [`examples/`](../README.md) that is a real site rather than a benchmark contract. The same
site exists in Next, in Kerf and as a SolidStart port in this folder, so Kerf is never compared with only one other
stack. It is the app the examples README uses to show the manifest format, and the one the parallel-versus-serial check
(`--jobs=1`) was last run on.

## What the app shows

| Page | What's on it |
| --- | --- |
| `/` | Site header and skip link, then the hero, How it works, Meet Lemon, Programs, Sponsor, an audience switch (ARIA tabs), Safety, FAQ, a contact form and a final call to action. |
| `/privacy` | Privacy policy. |
| `/terms` | Terms. |

In the SolidStart version ([`solid/`](./solid)):

- **The lemon.** `src/components/lemon/` is an animated character (`face.tsx`, `rig.tsx`, `palette.ts`) used across the hero,
  the coach demo, the sections and the contact form.
- **Forms.** `joinWaitlist` and `contact` are server functions wrapped in SolidStart `action()`s. They validate with
  `zod` (`src/server/lead-input.ts`), write to the `lemonstand_waitlist_signup` and `lemonstand_contact_message` tables
  through Drizzle, and are rate limited per client IP by a small in-memory fixed-window limiter
  (`src/server/rate-limit.ts`, 10-minute windows).
- **Mail.** `src/server/mail/` sends an alert for each signup and contact message through `nodemailer`. Sending is skipped
  while `SMTP_HOST` is empty, and a failed send never fails a saved signup.
- **HTML compression.** `src/middleware.ts` compresses rendered HTML with brotli (quality 5) or gzip, because Nitro only
  precompresses built assets (`compressPublicAssets` in `vite.config.ts`).
- **Fonts.** Figtree and Fraunces `woff2` files in `src/assets/fonts`, with their licences.

## The variants

From [`app.json`](./app.json):

| Variant | Path | Notes |
| --- | --- | --- |
| `next` | `~/dev/lemonstand-landing` | The original Next site, outside this repository |
| `kerf` | `~/dev/lemonstand-kerf` | The Kerf conversion, outside this repository |
| `solid` | [`solid/`](./solid) | SolidStart 2.1.0, `solid-js` 1.9.17, Tailwind 4, Drizzle, `nodemailer` |

A `~` in a path means `BENCH_HOME` when it is set, otherwise your home directory. Bench only reads those folders: it
copies what git would track into its work area and never copies a real `.env`. The manifest sets no `label`, so results
show each stack's default label from [`../stacks.json`](../stacks.json).

Hydration is timed with a probe: from the first frame, bench clicks `[role=tab]:nth-of-type(2)` every frame until the
`[role=tablist]` markup changes, under a 4x CPU throttle. Every variant has the audience tabs, so the same DOM event
is timed in all three.

There is no `db` key and no `e2e.test.mjs`: bench provisions no database for this app, and no page declares a canary.

## Latest numbers

From [`../results.json`](../results.json): run at 2026-10-31T19:21:59Z, commit `1174811`, 3 samples per page, on a
28-core host whose peak 1-minute load was 5.86. Medians only. Whether a gap is a win depends on the spread, which the
file and the chart keep: a win is only called when no sample of one side overlaps the other.

| Variant | Page | Mobile score | Mobile LCP | JS (brotli) | Hydration | Server req/s |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| next | `/` | 94 | 3016 ms | 135.2 KB | 696 ms | 720.5 |
| kerf | `/` | 98 | 2253 ms | 33.2 KB | 348 ms | 389 |
| solid | `/` | 99 | 2253 ms | 53.7 KB | 365 ms | 445.5 |
| next | `/privacy` | 100 | 755 ms | 135.4 KB | 198 ms | 2253.5 |
| kerf | `/privacy` | 100 | 752 ms | 13.9 KB | 64 ms | 1913.5 |
| solid | `/privacy` | 100 | 753 ms | 26.2 KB | 43 ms | 2126 |
| next | `/terms` | 100 | 756 ms | 135.4 KB | 191 ms | 2525 |
| kerf | `/terms` | 100 | 920 ms | 13.9 KB | 62 ms | 2097 |
| solid | `/terms` | 100 | 753 ms | 26.3 KB | 41 ms | 2291.5 |

KB is bytes / 1024 of every script the page fetched, recompressed at brotli 11. The full run, including the diagnosis
for the Kerf variant, is in `results.json`, and `../evals/results/apps.html` charts it with history.

## Run it

> [!IMPORTANT]
> `bench.mjs` needs Node 26, the benchmark tools installed once with `pnpm install` in `examples/`, and the two external
> checkouts at the paths above (or `BENCH_HOME` pointing at a folder that has them).

### Benchmark

```bash
pnpm run setup                         # repo root, once
cd examples
pnpm install                           # benchmark tools only
node bench.mjs lemonstand
node bench.mjs lemonstand --only kerf --no-record    # try a change, write nothing
node bench.mjs lemonstand --detect                   # what it worked out, without building
node bench.mjs lemonstand --jobs=1                   # everything in turn, to check parallel numbers
```

### Click through the Kerf build

```bash
cd examples
node bench.mjs lemonstand
node show.mjs                          # the last Kerf builds, from port 5501
```

### Run the SolidStart version on its own

```bash
cd examples/lemonstand/solid
cp .env.example .env                   # DATABASE_URL; leave SMTP_HOST empty to skip mail
npm ci
npm run dev
```

`.env.example` also lists `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`, `MAIL_REPLY_TO`, `LEAD_ALERT_EMAIL`
and `SITE_URL`. The schema is in `solid/drizzle/`.
