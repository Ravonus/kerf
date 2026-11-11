<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">bench/</h1>

<p align="center">
  <strong>The run loop behind <code>examples/bench.mjs</code>: one app, every variant, in phases that never overlap.</strong><br>
  Two files: <code>run.mjs</code> orders the work, <code>samples.mjs</code> takes and summarises the samples.
</p>

<p align="center">
  <a href="#run-it">Run it</a> ·
  <a href="#runmjs">run.mjs</a> ·
  <a href="#samplesmjs">samples.mjs</a> ·
  <a href="../README.md">All examples</a> ·
  <a href="../lib/README.md">lib/</a>
</p>

> [!NOTE]
> Internal tooling, not a published package and not an app: this folder has no `app.json`, so `bench.mjs --all` never
> treats it as one. It is imported by [`../bench.mjs`](../bench.mjs) and nothing else.

[`../bench.mjs`](../bench.mjs) parses the command line, loads each app's manifest, refuses to start on a busy machine,
and then hands every app to `benchApp()` here. What comes back is the run that is printed, written to
`results.json` and appended to `../evals/results/apps-history.jsonl`. The point of the split is that the order of
phases, which decides whether numbers can be trusted, lives in one short file.

## Run it

You don't run these files directly. Use the entry point:

```bash
cd examples
pnpm install                           # benchmark tools, once
node bench.mjs <app>                   # e.g. lemonstand, todo, admin
node bench.mjs --all
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--samples=N` | `3` | Samples per page. Use 5 before stating a claim. |
| `--jobs=N` | half the free cores, at most 8 (`KERF_JOBS` too) | How much runs at once. `1` runs everything in turn. |
| `--build-runs=N` | `3` | Cold builds per variant when its inputs changed. |
| `--rebuild` | off | Build even if the build key hasn't changed. |
| `--only=a,b` | all | Just these variants. |
| `--no-load` | off | Skip the server load phase. |
| `--no-record` | off | Print only: no `results.json`, history line or chart. |
| `--json=file` | none | Also write the run to a file, to compare with another. |
| `--detect` | off | Print what each manifest and `package.json` resolve to, and stop. |

## run.mjs

Exports `benchApp(app, config)`. The phases, in order:

| Phase | Function | What happens | Width |
| --- | --- | --- | --- |
| Databases | inside `benchApp` | For an app with `db`, `provision()` clones the seeded template per variant and starts a latency proxy at the low RTT. | per variant |
| Pack | `packOnce()` | Packs this checkout's Kerf packages into tarballs, once per state of `packages/` and `crates/`. Only when a variant is in the Kerf family. | once |
| Builds | `buildVariants()` | `prepare()` copies, installs and cold-builds each variant, or reuses a build whose key matches. Records build time, lines of app code and the build key. | `--jobs` |
| Servers | `startVariants()` | Starts each production server on a free port, proves it serves this build, and signs in the bench user where the app has `login`. | in turn |
| Timed samples | `timedSamples()` | Bytes, hydration and the really throttled Lighthouse run. | `--jobs`, each variant's passes in turn |
| Lighthouse | `lighthouseSamples()` | Simulated mobile and desktop runs, shuffled across a pool. | `--jobs` |
| Server load | `loadSamples()` | A 0.5 s warm-up, then per sample a 2 s compressed run and a 1 s uncompressed run. Skipped for static builds and with `--no-load`. | one variant at a time |
| Database, flows, races | `siteSamples()` | `sitePass()` per variant: canaries, query counts, round trips, TTFB, nav, interaction, streaming, mutate and race probes. Only for apps with `db`. | one variant at a time |
| Finish | `finish()` | Sourcemap split per variant, repo state, peak load, the previous comparable run from history, and `diagnose()`. | once |

Why the widths differ: server load reads about 25% low when variants run side by side, so it goes one at a time. The
database phase resets databases and moves the proxy's RTT, so it also goes one at a time, and last. Servers and
databases are stopped in a `finally`, whatever ends the run.

`finish()` returns `{ run, line }`. `run` is the full result (with `diagnosis`, and `db` server info for database
apps). `line` is the compact history record: per variant its label, stack, build key, build time, lines, Kerf tarball
and the per-page metrics.

## samples.mjs

| Export | What it does |
| --- | --- |
| `timedSamples()` | For each sample and page: signs in again, checks the server is still this build, runs the canary for `live` pages, then `bytesPass`, `hydrationPass` and `lighthouseThrottled`, checking every asset it touched against the build's fingerprints. |
| `lighthouseSamples()` | Builds one task per variant, page, sample and form factor, shuffles them so no variant always runs at the pool's busiest, and runs `lighthouseRun`. The first sample of each page keeps its full Lighthouse JSON in the variant's work folder. |
| `summarise(page, samples)` | Turns samples into `{ med, min, max, n }` for every metric: `mobile.*` and `desktop.*` (score, FCP, LCP, TBT, CLS, speed index), `bytes.{js,css,html,font}.{br,gz}`, `browser.*` (hydrate, script, heap, nodes, elements, comments) and `throttled.{lcp,fcp}`. What can't be medianed (LCP phases, Lighthouse findings, the resource list, unused bytes) comes from the sample nearest the median LCP. |

Every sample also records the machine load at the time, and the run keeps the highest as `loadMax`.

## Related

- [`../lib/README.md`](../lib/README.md): the modules these call (build, serve, measure, flow, race, diagnose, stats).
- [`../README.md`](../README.md): what is measured, the manifest keys and the honesty rules.
