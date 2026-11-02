# 12 — Slimming Pretext: a per-engine, lazily split text engine for weft

Research date: 2026-10-28. Everything here is measured unless marked **(estimate)**. Sizes are brotli quality 11
on minified ES2020 output. Accuracy and timing runs used headless Chrome 156.0.8078.48 and Playwright's WebKit 27.2
on an M4 Max, at load averages 5–31 (all under the 40 that `~/.claude/CLAUDE.md` sets for offloading).
- **Upstream:** `@chenglou/pretext` 1.0.0, from `npm pack` (sha256 `f1d9ac42…060a`, full value in
  `packages/text/package.json`).
- **Prototype:** [`packages/text/`](../../packages/text/). Its README credits Pretext and Cheng Lou,
  and its LICENSE carries Pretext's MIT licence and third-party notices.
- **Background:** builds on [research 11](11-text-and-type.md), §1 (Pretext) and §8 (its 34.5 KB cost).

**The ask:** make Pretext smaller for weft without losing accuracy. The target is a base chunk of **≤10 KB br for
Latin + emoji with zero accuracy loss**, with other scripts loaded lazily. Then decide whether to fork or send
patches upstream.

---

## TL;DR

1. **The target is met for Blink and WebKit, but only with a two-tier design. Pretext's code alone can't reach it.**

   | Engine | Base chunk | Exact tier (lazy) | Scripts pack (lazy) |
   |---|---|---|---|
   | Blink | **8.18 KB br** | 10.5 KB | 12.4 KB |
   | WebKit | **9.31 KB br** | 8.9 KB | 10.3 KB |

   - The base is a small "lite" tier: Pretext's own break scan and its simple line counter, over tables cut down to
     a Latin + symbols + emoji alphabet.
   - Specialised Pretext loads lazily as the exact tier, for any text or font the lite tier can't vouch for.
   - Upstream `prepare` + `layout` is 33.9 KB br. Both base figures include a 0.21 KB engine-detector shell.
2. **Specialising Pretext alone floors at about 14 KB br.** The levers below stack:
   - folding the engine profile to constants;
   - per-engine data;
   - restricting the tables to the alphabet;
   - lazy packs;
   - terser.

   They take Blink from 33.9 to **14.2 KB br**. About 5.4 KB of break data and 6–7 KB of measurement logic remain
   in any single-file exact build. **≤10 KB is not reachable without changing what the base does**, hence the lite
   tier.
3. **Accuracy: zero differences from unmodified Pretext.**
   - **Coverage:** every corpus (Latin, hard Latin, emoji, Arabic, CJK, Thai, mixed; 1,000 paragraphs each), at
     11 widths from 60 to 900 px, in both browsers. Arial in all corpora, plus Times New Roman, Georgia, Verdana and
     Helvetica on Latin, hard Latin, emoji and mixed.
   - **DOM:** every mismatch is one Pretext has too. CJK in Chrome is 4 of 2,000 layouts, the same 2 paragraphs as
     research 11.
   - **`lines()`:** it returned the same ranges as `walkLineRanges()` (width and cursors) for all 54,000+ lite line
     sets checked.
4. **The lite tier covers less than it sounds.**

   | Font | Plain-Latin paragraphs in lite, Chrome | WebKit |
   |---|---|---|
   | Georgia, Verdana, Helvetica | 100% | 100% |
   | Arial | 78% | 100% |
   | Times New Roman | 65% | 100% |

   - **Arial and Times in Chrome:** these fonts kern a space against some letters, and Blink applies that kerning.
   - **Hard Latin, 71%:** NBSP and other glue characters are outside the envelope.
   - **Mixed scripts, 33%.**
   - **Narrow layouts:** a layout narrower than a paragraph's widest word needs an emergency break, so it loads the
     exact tier.
   - **Net effect:** on a typical page the exact tier often loads soon after first paint. The base is the
     critical-path cost, and the total is base + exact ≈ 18–19 KB, against 33.9 KB upstream.
5. **Speed is unchanged.** Per 1,000 paragraphs, `prepare` ranges from 10% faster (lite Latin, emoji) to 14% slower
   (hard Latin and other scripts: an extra envelope check, then exact). `layout` stays at 0.2–0.5 ms in both.
6. **Firefox doesn't get a lite tier yet** (Gecko base: 15.3 KB br, exact tier eager). Gecko's segmentation (ICU4X)
   and space handling have no lite twin. Porting the lite tier is the next step, and the same design should land it
   near 8 KB **(estimate)**.
7. **Recommendation: fork-and-track now. Send three upstream PRs that would shrink the fork to the lite tier.**
   - **The fork:** a pinned vendor copy, the specialiser, and the corpus diff gate (zero diffs from upstream in
     both browsers) on every bump.
   - **The PRs:** a build-time engine constant, a base-alphabet data split with an install hook, and an exported
     simple-path API.
   - **A bug the fork found:** the specialiser hit a name clash that silently disabled Han kerning in an earlier
     build. It shows why the diff gate and the specialiser's fail-loud checks matter.

---

## 1. Where Pretext's 34 KB goes

Built with esbuild (minified, ES2020) from the npm source. Per-module brotli shares come from the metafile.

| Build | Size (KB br) |
|---|---|
| `prepare`, `layout`, `clearCache` | **33.87** |
| + line ranges (`walkLineRanges`, `materializeLineRange`, `layoutWithLines`) | 34.51 |
| + `rich-inline` | 38.86 |

| Module in the core build | KB br | What it is |
|---|---|---|
| `generated/engine-break-data.ts` | 11.6 | Break tables for all three engines: Blink and WebKit Latin-1 pair tables, ICU RBBI state machines, ICU4X data for Gecko, the class maps |
| `measurement.ts` | 5.0 | Canvas measurement and all corrections. Engine profile (~32 fields), Blink space kerning, emoji correction, kana kerning, letter spacing, WebKit generic families |
| `line-breaks.ts` | 3.5 | Blink and WebKit scans, RBBI runner, table unpackers |
| `line-break.ts` | 3.3 | The line walkers: simple fast path plus the 580-line `walkPreparedComplexLines` |
| `prepare.ts` | 2.7 | Segment assembly, widths, Han/kana kerning hooks |
| `gecko-line-breaks.ts` | 2.5 | Gecko's scan |
| `analysis.ts` | 2.4 | Whitespace collapsing, segment kinds |
| `generated/webkit-generic-families.ts` | 1.25 | Per-language generic family names (WebKit on Apple) |
| `han-kerning.ts` | 1.2 | Blink's `HanKerning` port |
| `graphemes.ts` | 0.3 | Grapheme cluster table runner |

Every browser downloads all three engines' tables and code paths. For Latin text, most of it never runs.

## 2. The levers

Each lever below is measured on its own and in sequence. "Accuracy" means line-count differences from
unmodified Pretext across the whole corpus.

| Lever | KB br saved | Accuracy cost | Verdict |
|---|---|---|---|
| **(a) Per-engine builds.** Fold the engine profile to constants so esbuild drops the other engines' branches | 7.3 Blink (33.9 → 26.6), 5.5 WebKit (→ 28.4), 7.1 Gecko (→ 26.8) | 0 diffs | **Take.** Needs a 0.2 KB detector that loads one engine's chunk |
| **(a′) Per-engine data.** Ship only that engine's tables | further 0.5 Blink (→ 26.1), 3.1 WebKit (→ 25.3), 5.3 Gecko (→ 21.5) | 0 diffs | **Take** |
| **(b) Native `Intl.Segmenter` / `Intl.Locale`** in place of the ported tables | ≤ 0.5 **(estimate)**: only graphemes (0.3) and break-language parsing could go | Not engine-faithful. `Intl.Segmenter` has no `line` granularity, and its graphemes run 34–39 ms per 1k paragraphs in Node against ~1.5 for the table | **Reject.** Pretext already uses `Intl.Segmenter` for dictionary words, where it is right |
| **(c) Split by script.** Restrict tables to a base alphabet (Latin, symbols, emoji, ~6,100 code points), with full tables plus CJK/kana/SEA code in a lazy `scripts` pack | 8.2 Blink (→ 17.9), 5.4 WebKit (→ 19.9), 4.1 Gecko (→ 17.4). Lazy pack: 12.4 / 10.3 / 7.8 | 0 diffs. A fuzz of 4,000+ in-alphabet strings breaks identically in all three scans | **Take.** Arabic, CJK and Thai pages pull the pack for ~93% of paragraphs. That is the point: Latin pages never do |
| **(d) Drop features.** Leave out rich-inline (weft doesn't use it, research 11 §2.2). Move letter spacing, WebKit generic families and the complex walker to lazy packs | 5.0 (rich-inline, never built), then 0.8 spacing + 1.9 families (WebKit) + 2.3 complex moved out of base | 0 diffs. Packs load on demand. A missed pack throws `PackMissing` at prepare time, never in `layout()`, and the provider retries | **Take** |
| **(e) Minifier.** terser (3 passes, top-level mangle) against esbuild | 0.9 on a 15 KB exact base; 0.2–0.3 on the final lite base. Concatenating split chunks: another 0.3–0.4. Property mangling: ~0.3, not applied (brittle against upstream changes) | 0 diffs (rechecked on terser output) | **Take terser** as the default build |
| **(f) Rust → WASM** (comparison only) | `unicode-linebreak` 0.1.5: 7.3 KB. + `unicode-segmentation`: 16.2 KB. `icu_segmenter` 2.4 without complex scripts: 21.9 KB; with them: 303 KB. `rustybuzz` 0.20.1 for shaping: 165.6 KB | Generic UAX #14 is not any browser's line breaking, so not engine-faithful. Offsets are UTF-8. Canvas widths still come from JS | **Reject.** Smaller only for the break rules, and wrong where Pretext is right. Fast (1.5 ms per 1k paragraphs, Node) |
| **(g) Simplify data structures.** Prune RBBI states unreachable over the alphabet's categories, Moore-minimise, merge identical columns (keeping the categories of `{`, `}` and U+00AD), varint/LZ re-encoding, alias identical tables | Inside (c): Chromium `line_normal` goes from 65 categories / 365 states to 43 / 134, and its char table from 21/16 to 11/10 | 0 diffs. Every table round-trips at generation, and the fuzz checks the scans | **Take** |
| **(g′) Coverage-guided "rare" pack.** Prepare-time functions that never ran on the coverage corpus move to a lazy pack | ~0.5 off base; the pack is 6.9–7.7 KB | 0 diffs. A miss costs a lazy load and a second `prepare` | **Marginal.** Most never-run code was already dead after (a). Kept because it is free |
| **(h) The lite tier.** The base holds a small engine for text inside an "envelope" and loads specialised Pretext lazily for everything else | Base 14.2 → **7.75 KB** (Blink, terser, one file) | 0 diffs, given the envelope (§3) | **Take.** It is the only way under 10 KB |

**Exact-only floor (a + a′ + c + d + e + g):**

| Engine | One file | Split |
|---|---|---|
| Blink | 14.2 KB br | 16.4 |
| WebKit | ~15.5 KB br **(estimate)** | 16.7 |
| Gecko | ~14.8 KB br **(estimate)** | 15.8 |

What remains in the base (Blink; the last three are rough shares from the metafile):
- the restricted tables and scan (5.3 KB br);
- the measurement module with its corrections (~3.4);
- prepare and analysis (~3.5);
- the walker and layout (~2).

None of these can be dropped without dropping a correction that some Latin text needs.

## 3. The lite tier and its envelope

`src/lite.ts` is not a re-implementation of Pretext's measurement. It reuses Pretext's
exact break scan (`getBlinkLineBreaks` / `getWebKitLineBreaks` over the restricted tables). Together with the provider it is 2.4 KB br of the base (`engine.js`). It does only what
Pretext itself does for text where all its corrections are zero:
- **Segments:** a TEXT segment for each run between break opportunities, then a SPACE segment for each collapsed
  space.
- **Widths:** canvas widths, cached per font.
  - On WebKit, a word followed by U+0020 is measured with the space and the space's width is subtracted
    (`getFollowingSpaceTail`).
  - WebKit's scan puts a break before the space, so the rule is "the next character is a space", not "this run
    ends in one". An early build got this wrong, and the corpus caught it.
- **Line counting:** `countPreparedLines()`'s loop, with the same additions in the same order, so the float sums
  are bit-identical.
- **Line ranges:** `walkPreparedLinesRaw()`'s ranges. A line ends after its hanging space even where that space
  overflows.

**The envelope.** Anything outside it goes to the exact tier.
- **Text:**
  - base alphabet only;
  - `white-space: normal`;
  - no `keep-all`, no letter spacing;
  - none of: NBSP and the other glue characters, soft hyphen, zero-width and bidi controls, non-ASCII spaces,
    C0/C1 controls.
- **Font:** the probes Pretext itself runs, ported exactly.
  - **Blink, kerning with the space:** each segment's first and last character must kern 0 with the space, within
    float32 rounding. This is `getSpaceKerning` per edge, not per font: Arial "kerns", but only some letters do.
  - **Emoji correction** must be zero.
  - **Blink, curly quotes:** they must not type as fullwidth marks (`getFontData`'s `quoteFullwidth`, which drives
    Han kerning).
  - **WebKit:** no generic family name in the font string.
- **Width:** at least the widest segment. Narrower layouts need emergency breaks inside a word, which only the
  exact tier models. That layout starts loading the exact tier and returns an estimate marked `exact: false`
  until it arrives.
- **The base's own scan:** if it hits a path moved to the rare pack (`PackMissing`), the text goes to the exact
  tier. On the fuzz this happens only for keep-all, which the envelope already excludes.

How much text falls inside it (Latin corpus, share of paragraphs prepared lite):

| Font | Chrome | WebKit |
|---|---|---|
| Georgia, Verdana, Helvetica | 100% | 100% |
| Arial | 77.6% | 100% |
| Times New Roman | 64.6% | 100% |
| Hard Latin (NBSP and glue), any of the above | 44–71% | 71% |
| Mixed scripts | 21–33% | 33% |

**Worth doing next: model space kerning in the lite tier** (+~0.4 KB **(estimate)**). It is one additive correction
per segment edge, and it would bring Arial and Times in Chrome to ~100%. It was left out to keep the claim simple:
the lite tier only skips work that is provably zero.

## 4. Final numbers

**Sizes** (`npm run build`: terser, per-file brotli summed; the base includes the 0.21 KB detector):

| Engine | Base | Exact tier | scripts | complex | spacing | families | rare |
|---|---|---|---|---|---|---|---|
| Blink | **8.18** (7.75 as one file) | 10.47 | 12.39 | 2.01 | 0.79 | — | 6.86 |
| WebKit | **9.31** (8.82 as one file) | 8.89 | 10.29 | 2.20 | 0.79 | 1.87 | 7.30 |
| Gecko | 15.29 (exact in base) | — | 7.77 | 2.12 | 0.79 | — | 7.68 |

What a page fetches:
- **Latin + emoji only** (Chrome, Arial): base + exact. Never scripts, rare or complex.
- **CJK, Arabic, Thai:** base + exact + scripts (+ rare in Chrome) ≈ 38 KB. That is more than upstream's 33.9,
  paid by those pages only.

**Accuracy** (n = 1,000 paragraphs per corpus, 11 widths for the comparison with Pretext, DOM at 320 and 480 px):

| | Chrome: differences from Pretext | Chrome: DOM mismatches (Pretext's own) | WebKit: differences from Pretext | WebKit: DOM mismatches |
|---|---|---|---|---|
| latin, latin-hard, emoji, arabic, thai, mixed (Arial) | 0 | 0 (0) | 0 | 0 (0) |
| cjk (Arial) | 0 | 4 (4) | 0 | 0 (0) |
| Times New Roman, Georgia, Verdana, Helvetica × latin, latin-hard, emoji, mixed | 0 | 3 in all, each also in Pretext | 0 | 0 (0) |
| `lines()` against `walkLineRanges()`, lite handles | 0 of 23,858 | | 0 of 31,326 | |

**Speed** (ms per 1,000 paragraphs, median of 7; Chrome at load ~11):

| | latin | latin-hard | emoji | arabic | cjk | thai | mixed |
|---|---|---|---|---|---|---|---|
| `prepare` (cold), Pretext | 8.0 | 12.1 | 10.6 | 10.3 | 13.1 | 20.4 | 11.0 |
| `prepare` (cold), fork | 7.3 | 13.5 | 10.0 | 11.6 | 13.9 | 22.1 | 12.5 |
| `layout`, both | 0.2–0.3 | 0.3 | 0.3 | 0.3–0.4 | 0.3–0.5 | 0.4 | 0.3–0.5 |

- **WebKit** (timer resolution 1 ms): latin 8 → 6, emoji 9 → 7, other corpora within ±1 ms.
- **Under load ~20** both columns roughly double, and the ratio holds.

**Tests:** 22 vitest tests, all passing (`npm test`), with no browser. They cover:
- the restricted Blink, WebKit and Gecko scans against upstream's full ones on the corpus and the fuzz, with and
  without the rare pack;
- the lite counter and walker against a greedy reference on 3,000 random handles;
- the alphabet and the detector.

## 5. Risks

- **The envelope is an empirical claim.** The corpus is broad, but it is not exhaustive.
  - A Pretext release that adds a correction for in-alphabet text breaks the lite tier silently, unless the diff
    gate runs.
  - Mitigation: the gate runs on every bump, the envelope is narrow on purpose, and each check cites the Pretext
    function it mirrors.
- **The specialiser rewrites source text.** An early fold matched `measurement.hanKerning`, a cache field that
  shares a name with the profile's `hanKerning` flag. That build silently skipped Han kerning in Blink, and the CJK
  corpus didn't catch it (Arial's 「 has no halt). Two fixes:
  - folds are now limited to the three names upstream binds the profile to;
  - `npm run gen` fails if a profile field is never folded or a moved function is missing.

  A CJK-font corpus (PingFang, Hiragino) should be added to the gate.
- **Async exactness.** The exact tier and its packs load on demand.
  - Until they arrive, `layout()` returns an estimate marked `exact: false`, and the same handle becomes exact when
    `ready` settles.
  - weft/text must re-lay-out on `ready`, or call `load(needs(...))` before first paint for content known ahead.
  - Narrow columns (under ~100 px, or long URLs) trigger the exact tier often.
- **Coverage drift.** The rare split depends on `src/coverage/*.json`.
  - A stale file costs lazy loads, never accuracy.
  - `npm run coverage` must run on a build without the rare split. The npm script now does this; an earlier stale
    run had moved Han kerning's `getTrim` into rare.
- **Gecko has no lite tier,** so the Firefox base is 15.3 KB.
- **Upstream moves fast.** 1.0.0 shipped 2026-10-14, and the repo was already ahead (`0d102a5`) on 2026-10-28.
  Each bump is: re-vendor, `gen`, `coverage`, `test`, `test:accuracy`.
- **Licence.** `dist/` is a derived work. `dist/LICENSE-pretext` carries Pretext's MIT licence and its Chromium,
  WebKit, ICU, ICU4X and Unicode notices, and the build copies it there.

## 6. Upstream or fork

**Fork-and-track now.** Upstream PRs would make most of the fork unnecessary.

- **What the fork is:**
  - **Pinned source:** `vendor/pretext/` is the unmodified source of the npm tarball, with version, sha256 and
    integrity in `package.json`.
  - **Generated code:** everything specialised is generated (`scripts/specialize.mjs`, `scripts/gendata.mjs`).
    Nothing upstream is hand-edited.
  - **Gate:** `test/accuracy/run.mjs` compares the fork with the vendored upstream, in Chrome and WebKit, on every
    corpus and width. **A bump merges only at zero differences from upstream.**
  - **Hand-written code:** only `src/` (provider, lite tier, alphabet, detector). The lite tier is ~200 lines, each
    check citing the Pretext function it mirrors.
- **PRs worth offering to Pretext.** Each one stands alone and is useful outside weft.
  1. **A build-time engine constant** (for example `globalThis.__PRETEXT_ENGINE__`, or per-engine entry points).
     Branches on it fold, giving every bundler user lever (a): −7 KB.
  2. **Split break data into a base alphabet plus `installFullData()`,** with Pretext's own reset hooks. This is
     lever (c): −5 to −8 KB for Latin pages. The generator already exists as `scripts/gendata.mjs`.
  3. **Export the simple path:** `prepare` result kinds, `countPreparedLines`, and the envelope probes as a
     documented "simple text" API. With it, the lite tier would call Pretext instead of mirroring it, and the risk
     in §5's first point mostly goes away.
- **If 1 and 2 land:** the specialiser shrinks to a build config, and the fork to the lite tier.
- **If 3 lands too:** weft can depend on `@chenglou/pretext` directly and keep only the provider.
- **The two upstream subtleties this work found** (WebKit's following-space rule, and the hanging-space line end in
  `walkLineRanges`) are both correct upstream behaviour. They are worth a line in Pretext's docs for anyone who
  builds on its internals.
