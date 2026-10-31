# Real apps, any stack

`evals/compare` is one synthetic screen. This is the other half: point it at a real app and its other versions, and it reports
how weft compares and what to tune in weft or warp because of it. Run it after converting an app, and after changing weft.

    npm install                                  # once, Node 26
    node bench.mjs lemonstand                    # one app
    node bench.mjs --all                         # every folder here with an app.json
    node bench.mjs ~/dev/shop --samples=5        # any folder holding an app.json
    node bench.mjs lemonstand --only weft --no-record    # try a change, write nothing
    node bench.mjs lemonstand --detect           # what it worked out, without building

It's a tool for improving weft. Apps are fast by construction: this is not a budget gate, and it isn't a step in an app's
workflow.

`results.json` holds each app's latest run, `../results/apps-history.jsonl` gets a line per run, and `../results/apps.html` is
rewritten from both. Commit all three when a run is worth keeping.

## Adding an app

A folder here (or anywhere) with an `app.json`. No harness code.

```json
{
  "label": "Lemonstand",
  "pages": [{ "path": "/", "probe": { "click": "[role=tab]:nth-of-type(2)", "watch": "[role=tablist]" } }, "/privacy"],
  "variants": {
    "next": { "path": "~/dev/lemonstand-landing" },
    "weft": { "path": "~/dev/lemonstand-weft" },
    "solid": { "path": "solid" }
  }
}
```

A variant's `path` can be outside the repo, and it's only read: bench copies what git would track into
`~/.cache/weft-app-bench` (`BENCH_WORK` moves it) and never copies a real `.env`, `netlify.env`, `.neon`, `.mcp.json` or `*.pem`.
`.env.example` becomes the copy's `.env`.

From each `package.json` it works out the stack (`stacks.json`, most specific first), the package manager, the build and the
start. A variant with no start script is a static build, served from memory with brotli as a CDN would. Anything it gets wrong,
say in the variant: `stack`, `label`, `cwd` (build a subfolder of a copied tree, as `dashboard` does), `install`, `build`, `start`,
`env`, `src`, `publicDir`, `pm`. `setup` on the app runs a command in each copy after install, for a database or a seed.

To add a stack, add a line to `stacks.json`: its `detect` packages, its `out` folders, and regexes that sort sourcemap paths
into `groups`. `sourcemap` is `vite` or `next`; leave it out and that stack gets totals with no split.

`probe` is how hydration is timed: bench clicks `click` every frame from the first frame until `watch`'s markup changes, under a
4x CPU throttle. The same DOM event for every framework, so pick a control that exists in every variant. A page with no probe
reports when its long tasks ended, and the chart says which method a number came from.

## What it measures

Per variant and page, on production builds, `--samples` samples (3 by default, 5 before stating a claim):

- Lighthouse mobile and desktop: score, FCP, LCP, TBT, CLS, speed index, on its default simulated throttling.
- The same page mobile with the network and CPU **really** throttled. The score's LCP comes from Lantern, a model; a trace of an
  unthrottled run can't explain it, so the LCP phases come from this run, and Lantern's own phases sit beside them.
- JS, CSS, HTML and font bytes of everything the page fetched, recompressed to brotli 11 and gzip 9 for every variant, so a
  server's encoding can't flatter it; what the server actually sent is reported as well.
- Hydration, script time, heap after a forced GC, DOM nodes split into elements, text and comments.
- Server req/s and p95 at 10 keep-alive connections for 3 s, compressed as a browser would ask, and req/s uncompressed: the two
  together separate rendering from compression.
- Cold build time (`--build-runs`), lines of app code, boot time, server memory.

## Why it's quick

It's meant to run after every tweak. Tarballs are packed once per state of `packages/` and `crates/`. A variant's build is keyed on
its source files, lockfile, commands, Node and, for weft, those tarballs, and is reused while the key holds: a weft change rebuilds
the weft variants only, and an unchanged tree rebuilds nothing (`--rebuild` overrides; the output is re-fingerprinted either way).

Measuring runs in phases that never overlap. Variants go side by side with each one's timing-sensitive passes in turn, then
Lighthouse's simulated runs share a pool, shuffled, and last comes server load. `--jobs=N` and `WEFT_JOBS` set the width
(`scripts/jobs.mjs`); on a busy machine the default narrows by itself. `--jobs=1` runs everything in turn, which is the check that
parallel numbers match a serial run: results agreed within spread when this was last tested, see the history lines' `jobs` field.

## Running it on another machine

`BENCH_WORK` moves the work area and `BENCH_HOME` is what `~` means in a manifest, so an external variant can be a copy elsewhere; `BENCH_COMMIT` names the commit when the checkout there is a snapshot.
Bring only the files bench would copy; never a real env file.

## What it diagnoses

For each weft variant: the mobile points each metric costs; LCP phases and element; the largest resources; JS and CSS that
never ran, from browser coverage; the split into runtime, router, data, warp and app from sourcemaps of a separate build (whose
output has to hash the same, and says if it doesn't); the gap to the best other variant on each metric; what moved since the
app's last run; and a ranked list, where bytes and milliseconds are converted to rough score points at rates at the top of
`lib/diagnose.mjs`. Read the order, not the digits.

## Honesty rules

- A win is only called when no sample of one side overlaps the other and the gap is past the metric's floor (`lib/stats.mjs`).
  Otherwise it's a tie, however far the medians are. Three samples leave a 10% chance of a fluke per comparison.
- Every measurement proves it hit this build. The run writes a canary into `public/`, each sample fetches it back, and every JS
  and CSS file a sample touched has to hash to a file the build wrote. Any miss stops the run.
- Weft variants go through `local.mjs refresh` into a private store, so each run measures this checkout, and the installed `weft`
  is compared to the tarball byte for byte. Servers run on ports checked to be free, each in its own process group.
- Peak load is recorded per run. Over 40 at start it refuses: use another machine, with `BENCH_WORK` set.

The stack rule still holds: a claim about weft gets measured across the other variants, here and in `evals/compare`.

`node --test lib` covers the win logic, the freshness checks and stack detection.
