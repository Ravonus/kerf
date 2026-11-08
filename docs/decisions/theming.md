# Theme tokens and compatibility

Sprint 8 design, 2026-11-08. This decision defines the implementation contract. It does not
implement the API or claim that its checks have passed. The source baseline is `5954f6ce`.

## Existing contracts

- `packages/warp/plugin.mjs` validates options with paths, fits seed hues, and runs D010. Its
  `SCOPES` reapply overrides wherever the system tokens are derived. The current D010 filter can
  exclude light/dark and expression stops through `dials`; that is insufficient for named themes
  which can appear anywhere in the document.
- `packages/warp-core/scripts/split-css.mjs` generates `styles/` from
  `docs/design/warp/tokens/`. Changing only generated component CSS is not a source change.
  `build()` and `--check` compare the generated strings, including comments and whitespace.
- `packages/warp-core/styles/warp.css` defines layers, system tokens, the sweep, label colours and
  focus rings. Button also paints through tone channels, pseudo-elements, relative colours and
  highlight mixes. Replacing its first `background` declaration does not theme its animated fill.
- Nav paints both a moving indicator and a pre-script current-link indicator. Tabs has line,
  enclosed and pill variants. Link paints its underline with `currentColor`. Pill already has
  stylesheet rules, but there is no exported `Pill` component in the current warp entrypoint.
- `packages/warp-core/src/dial.ts` writes attributes synchronously, stores root choices under
  `warp:dials`, and announces `warp:dial`. `dialScript` restores those choices before first paint.
- `packages/warp/tailwind.css` uses `@theme inline` so utilities read tokens at the element.
  `Contributions.tokens.alias` in `packages/core/src/plugin.d.ts` already supports selecting a
  different module at build time. No compiler or core plugin API change is needed for CSS selection.

Default dimensions, typography, DOM anatomy, controls, focus behaviour, motion and timing stay as
they are. No existing screenshot or contrast expectation changes to accept this work.

## Configuration and names

Keep the roadmap's `warp({ colors, seed, parts, themes, dials })` shape. Add these types to
`plugin.d.mts`; the implementation accepts plain objects only:

- A colour is `#rrggbb`, a colour name, or `{ hue, chroma }`. Hue is finite and in `[0, 360)`;
  chroma is finite and in `[0, 0.37]`. Keep the existing compact `seed: { hue, chroma }` syntax.
- `colors` is a dictionary of colours. Aliases may point forward. Resolve with a visiting set and
  report the complete cycle rather than recursing indefinitely. `white` and `black` are built-in
  exact literals, `#ffffff` and `#000000`; other CSS names are not implicit dictionary entries.
- Colour and theme identifiers match `[a-z][a-z0-9]*(?:-[a-z0-9]+)*`. Reject empty names, spaces,
  punctuation and prototype keys. Colours and themes share one namespace because `tone` takes
  either. Reject collisions, including inherited colour names in a theme.
- Reserve `auto`, `default`, `light`, `dark`, `white`, `black`, the six existing tones (`neutral`,
  `accent`, `positive`, `caution`, `critical`, `info`), and the colour keys already exported by
  `tailwind.css` (for example `page`, `surface-raised`, `focus`, `on-accent`). This prevents utility
  shadowing and ambiguous tones. Themes cannot introduce new colour keys; they can replace the
  top-level colours. Thus the utility and tone vocabulary is fixed for the build.
- A named theme accepts only `seed`, `colors`, `parts`, and `tokens`. `fields`, `dials`, `radius`,
  `fonts`, nested `themes`, and `extends` are errors there. The existing app-wide options remain.

Resolve a named colour in the effective theme's dictionary, then the built-ins. A theme name is
valid only in `dials.palette`, `tone`, and palette attributes; it is not a colour in `parts` or
`seed`. Reject unknown top-level keys, part names, states, properties, colour names and palette
defaults. Keep P115 and the exact offending path, for example:

```text
parts.button.hover.bg: unknown colour `brnad`; use a colour name or #rrggbb
themes.ocean.parts.nav.pressed: unknown state; use hover, focus, active, disabled
colors.brand: colour cycle brand -> orange -> brand
dials.palette: unknown theme `oceen`; use default, ocean, sunset
```

Do not accept arbitrary CSS strings as high-level colours. Keep `tokens` as the existing raw CSS
escape hatch with its safety checks. Known colour-bearing raw tokens, including the new part
tokens, must be readable by D010. An unresolved expression in a checked pair is an error, never
an omitted pair or a passing result. Unknown custom `--warp-*` tokens retain today's validation;
an unused custom property does not itself constitute a colour pair.

### Exact colours and hue families

A hex colour in `parts` or a named utility is exact in both modes. Do not silently fit it. A hex
in `seed` still selects a hue family and prints where the fitted accent lands, as it does now.
Named aliases preserve this distinction: `seed.accent: 'brand'` fits; `button.bg: 'brand'` pins
the hex. This also avoids the current seed normalization treating a family object as a string.

A hue/chroma colour defines an adaptive family, since it supplies no lightness. Reuse the existing
seed fitting and gamut mapping, with the canonical role's lightness at each expression and mode.
Generate solid, solid-hover, on-solid, soft, text, border, sweep, label-rest and label-active roles.
Use solid for a fill or indicator, solid-hover for its hover fill, on-solid for text on a solid,
text for ordinary text, border for an edge, sweep for a stroke, and the label roles for labels.
The unfilled sweep's active copy uses text; the filled copy uses on-solid. D010 checks both.
This is role resolution, not permission to repair a failing explicitly pinned colour.

The public utility value is `--warp-named-<name>`: a literal for hex colours, the family's solid
role for hue/chroma colours. Internal family role tokens use `--warp-named-<name>-<role>`.
Resolve aliases before emission, and sort names for deterministic output.

## Part and state tokens

The spelling is `--warp-<part>-<property>[-<state>]`. The table is the complete high-level schema.
Each listed state accepts only the properties on that row. No arbitrary state objects or
`rest` object are accepted; top-level properties are the resting settings.

| Part | Resting properties | State properties | Token examples |
| --- | --- | --- | --- |
| `button` | `bg`, `text`, `border`, `highlight` | `hover`, `focus`, `active`, `disabled`: `bg`, `text`, `border`, `highlight` | `--warp-button-bg`, `--warp-button-text-hover`, `--warp-button-highlight-active` |
| `sweep` | `stroke`, `base`, `label`, `text` | `invalid`: `stroke`, `label`, `text` | `--warp-sweep-stroke`, `--warp-sweep-base`, `--warp-sweep-label`, `--warp-sweep-text`, `--warp-sweep-stroke-invalid` |
| `nav` | `text`, `underline` | `hover`, `focus`, `active`, `disabled`: `text`, `underline` | `--warp-nav-underline`, `--warp-nav-text-active` |
| `tabs` | `text`, `underline` | `hover`, `focus`, `active`, `disabled`: `text`, `underline` | `--warp-tabs-underline`, `--warp-tabs-text-focus` |
| `link` | `text`, `underline` | `hover`, `focus`, `active`, `disabled`: `text`, `underline` | `--warp-link-text`, `--warp-link-text-hover` |
| `pill` | `bg`, `text`, `border` | `hover`, `focus`, `active`, `disabled`: `bg`, `text`, `border` | `--warp-pill-bg`, `--warp-pill-text-active` |
| `badge` | `bg`, `text`, `border` | none | `--warp-badge-bg`, `--warp-badge-text` |
| `field` | `label`, `bg` | `floated`: `label`; `hover`, `focus`, `invalid`: `label`, `bg`; `focus`, `invalid`: also `ring`; `disabled`, `readonly`: `label`, `bg` | `--warp-field-label`, `--warp-field-label-floated`, `--warp-field-label-focus`, `--warp-field-ring-focus` |
| `focus` | `ring` | none | `--warp-focus-ring` |

The expansion rule makes every token name exact: for instance, every `button.hover` property
is `--warp-button-<property>-hover`, without aliases such as `fill`, `fg`, or `pressed`.
`sweep.label` is the resting frame label. `sweep.text` is the copy revealed while the sweep runs,
including the filled-frame copy. It is deliberately different from a field's label.
The existing `--warp-sweep-fill` remains a raw token; it is not renamed or stripped by the build.

`active` means press for Button/Link; current or selected for Nav/Tabs/Pill. These definitions
follow existing attributes, including Button's `data-press`, and do not add interaction state.
Focus means `:focus-visible`, or `:focus-within` for a field. Hover keeps existing pointer media
guards. A field is floated when the existing filled/date/lift selectors say so. Invalid and
disabled states keep their existing selectors, double borders, opacity and motion suppression.

When states overlap, colour precedence is disabled, invalid (fields/sweeps), active, focus,
hover, floated, rest. That order concerns supplied colours only. Preserve existing geometry and
animation precedence. A missing state property reads the configured resting property, then the
exact old expression for that paint site. Invalid label/stroke/ring properties are the exception:
without an explicit invalid setting they retain their critical fallback, bypassing ordinary
resting/hover/focus overrides. A missing resting property reads the old expression.
Do not place local fallback expressions in `:root`: they must resolve on their original host.

### Default paint sites

These are fallbacks, not replacement colour constants. Keep the original expression at every
site, including its tone channels, `currentColor`, opacity, mix, and light/dark dependencies.

| Paint | Existing fallback and required coverage |
| --- | --- |
| Button fill, ink, border | `--warp-tone-fill/ink/edge` over `--_fill/ink/edge`; preserve primary roles for a button without an explicit tone, and soft/outline/ghost/frame/link emphasis |
| Button animated fill | `--_layer`, `--_pa`, `--_pb`, their highlight mixes and relative-colour branch; supplied state `bg` must colour every visible fill stop, not only the host background |
| Button highlight | `--warp-color-highlight-solid` at each mix; without an override the entire mix stays byte-for-byte intact |
| Sweep stroke and base | `--warp-color-sweep`, tone/field `--_tint` and `--_base`, `--warp-color-sweep-base`; also frame corners and all six outline segments |
| Sweep label and active text | `--_tone` over accent-text at rest; text for an unfilled copy; `--_tone-ink` over on-solid for a filled copy |
| Invalid sweep | critical-solid stroke and critical-text label; ordinary sweep settings cannot erase the invalid treatment |
| Nav | subtle text at rest, text on hover/focus/current; accent-solid for both moving and pre-script indicators, on both axes |
| Tabs | subtle text at rest, text on hover/selected; accent-solid for the line/enclosed indicator; retain raised-surface fill for the pill indicator |
| Link | accent-text, inherited ink for `subtle`, and currentColor for the underline/gradient; cover bare anchors in `warp/src/links.css` as well |
| Pill | raised-surface/subtle-text/border at rest; text on hover; accent-soft/accent-text/accent-border when selected |
| Badge | the existing soft/text, solid/on-solid and outline/border tone channels |
| Field | label inside, label-rest floated, label-active on hover/focus, critical-text when invalid; field/field-active/field-invalid backgrounds, including classic and line variants |
| Focus | color-focus in the global ring and field action rings; field focus remains the sweep where it currently suppresses the ordinary outline |

A Tabs underline setting affects its line/enclosed indicator, not the pill variant's raised
selection surface. The pill variant still gets text state settings. Field `ring` colours its
focus indicator (the sweep, or an existing outline); it does not add a ring. Its explicit
invalid ring wins over the ordinary focus ring. `focus.ring` supplies the common ring fallback.
Forced-colour system paints always win. Do not wrap `CanvasText`, `Highlight`, or other system
colours in a configurable fallback.

## Merge and scope rules

Normalize legacy seed forms to optional `accent` and `neutral` before merging. Do not fill an
omitted accent with the default until after the merge. The base theme is the app's seed, colours,
parts and tokens. A named theme deep-merges that base: colour/token dictionaries by key, seeds
by accent/neutral, and parts by property within each state. Leaf values replace; arrays and null
are errors. There is no theme-to-theme inheritance. Resolve aliases after the merge so an
inherited `parts.button.bg: 'brand'` follows a theme's replacement of `colors.brand`.

The precedence for each effective theme is canonical defaults, seed-derived values (including
existing seed fitting), parts, then raw `tokens`. Raw part tokens beat their high-level entries.
Explicit per-element tone colours beat inherited part settings for that component; an inline
part token on that element or ordinary author CSS can override them. Preserve existing semantic
tones and emphasis when there is no explicit theme setting.

Use **`data-palette`** for a named theme. Keep `data-theme` exclusively for light/dark. The implicit
palette is `default`, meaning the base theme. `data-palette="default"` explicitly resets a nested
palette to that base. `dials.palette` selects the default through CSS when no attribute is set.
An explicit root or subtree attribute wins over that config default.

Each palette root installs a complete effective set, not only its differences from the base.
For the union of configured part/raw override slots, emit a value or CSS `initial` at every
palette boundary. The latter makes the custom property invalid so its `var()` fallback runs.
Otherwise an omitted sunset setting would leak an ocean setting from an ancestor.

System token expressions must re-evaluate at `[data-palette]` and every existing dial scope.
Generated themed CSS adds those roots to the existing derivation selectors. Seed and override
inputs inherit; a density/expression/theme scope inside a palette recomputes using those inputs.
The config default's resolved semantic page/text/accent values also feed generated share cards;
part-only settings do not recolour a card. Existing legacy-only card defaults stay unchanged.
For system-token overrides, use inherited private input slots, such as
`--warp-config-color-page`, and read them at each system declaration with the original expression
as fallback. Assign the private inputs at palette roots, then rebind the public tokens at dial
roots. Merely assigning `--warp-color-page` at an outer palette root loses to a nested dial's
declaration. Apply the same rule to radius/fonts and legacy raw overrides in the themed path.
Do not emit fallback aliases that eagerly resolve component-local `--_fill` or `currentColor`.

Inheritance follows DOM ancestry, including a scope placed on the component itself. A portal
outside that ancestry needs a palette attribute on its existing portal root; this API does not
change reparenting or overlay placement. Unknown hand-written palette attributes use the base
palette and reset configured slots; plugin defaults and runtime calls reject unknown names.
Test both palette-inside-dial and dial-inside-palette, nested different palettes, a base reset,
and palette/theme attributes on the same element. No descendant selector may leak across an
inner palette boundary.

## Byte-identical output without configuration

Adding `var(--warp-button-bg, old)` to shipped CSS changes its bytes even when it paints identically.
Keep two generated variants, selected through the existing token alias facility:

1. Author valid, tokenized CSS in the canonical `docs/design/warp/tokens` sources. At each paint
   site wrap the exact old expression, without changing its interior text. For example,
   `var(--warp-button-bg, var(--warp-tone-fill, var(--_fill)))` wraps the existing fallback.
   New part-token reads are unregistered custom properties; no root default is necessary.
2. Add one lexical helper, `packages/warp-core/scripts/theme-css.mjs`, used by generation and
   compatibility verification. It recognizes balanced `var()` calls for the explicit new token
   schema and unwraps them to their fallback for the legacy variant. Retain every fallback byte,
   comment, selector, whitespace and rule order. Reject missing fallbacks. Do not use a global
   regex or strip any existing `--warp-*` variable (especially `--warp-sweep-fill`).
3. Run the existing splitter on that lowered legacy source. Existing `styles/` paths and
   `manifest.json` must match the pre-tokenization bytes. Generate part-aware counterparts under
   `styles/themed/` for changed files, including the scope derivation changes. Keep the split
   ownership, selective choice/text sheets, layers and forced-colour tails identical. Include
   those new artifacts in `build()` and `--check`, so their staleness also fails the package test.
4. For nonempty `colors`, `parts`, or `themes`, or raw use of a new part token, `warp()` contributes
   aliases from each changed `@weft-js/warp-core/styles/<path>` to its themed counterpart. Alias
   `@weft-js/warp/links.css` to its packaged themed counterpart too. Give the existing bare-link
   import in `styles.ts` that stable package id and add its export in warp's `package.json`;
   today's alias resolver matches raw import strings, so an absolute alias key cannot intercept
   `./links.css`. Cover the real import chain in an ordinary build fixture. Leave unchanged CSS
   imports alone. The default plugin contributes no aliases and no new CSS. Empty dictionaries
   are equivalent to absence. Legacy-only seed/fields/dials/radius/fonts/tokens retain their
   existing path unless a new part token is present. The plugin's read permissions must include
   its own packaged CSS as well as warp-core when inspecting these artifacts.
5. Named palette declarations and tone selectors are config-dependent CSS in `weft:tokens/warp`.
   They supply inputs to the aliased rules; they do not duplicate entire component rules in a
   higher layer. Shared palette defaults belong after `warp.tokens` in the existing `warp.base`
   layer, while component-local tone channels keep their component layer. Author/Tailwind
   precedence therefore remains intact, and original forced-colour rules still win.

There is one editable source, not a maintained copy of the old styles. Package both variants
through the existing `styles/*` export. A framework-free consumer that wants part tokens without
the plugin explicitly imports the corresponding `styles/themed/` sheets. This opt-in is necessary
to meet the byte contract; default imports cannot gain working token reads without changing bytes.
For warp's bare-anchor CSS, add `docs/design/warp/tokens/warp-links.css` as its tokenized source.
The generator also checks/writes warp's `src/links.css` and new `src/links-themed.css`, using the
same lowering rule. Preserve the legacy sheet's exact header and bytes, without adding a generated
banner to it. The existing `src/links.css` becomes an unchanged default generated artifact.

Do not claim byte compatibility from a screenshot, equal Brotli sizes, or the plugin's empty
contribution alone. Compare the old public files and the final emitted ordinary-consumer CSS.
Record the baseline ref before implementation; update it only for an independently accepted
source change, with the reason in the integration report. Do not regenerate expected output
from the candidate being checked.

## Contrast: D010

Keep the current thresholds: 4.5:1 for text, 3:1 for control boundaries, indicators and focus,
including sweep versus resting base as well as surrounding surfaces. Keep current compositing
and gamut mapping. Disabled colours retain their existing contrast policy and opacity; do not
lower a threshold for enabled text to accommodate a theme.

Check the base, every named theme, and every generated named-colour tone against light/dark ×
quiet/balanced/vivid, even if default dials choose a subset. Check all permitted overlaps and
emphases that change a pair: solid/soft/outline/ghost/link/frame, filled/unfilled sweep, rest,
hover, focus, press, selected, floated and invalid. Evaluate inherited unchanged partners too:
changing only `button.hover.bg` can fail with its inherited text. Raw tokens apply last in the
same environments. Named-theme tones run the same complete check as palette scopes.

Extend `contrast-check.mjs` to consume the effective palette, component-local channels and state
pair descriptions from the theme resolver. Its current root-only token pairs cannot prove a
button's pseudo-element fill or a part's state. Include both relative-colour and fallback fill
branches, state overlays, highlight stops, and text against those fills. Unsupported colour
resolution fails closed with the source path. Use the shared colour math, not a second contrast
formula. Keep all existing canonical pairs and the command's failure exit status.

Each failure includes D010, palette, expression, light/dark, part, state, emphasis/paint site,
source config path (including an alias's defining path), foreground/background tokens, measured
ratio and threshold. For example:

```text
D010 themes.ocean.parts.button.hover.text: ocean/dark/balanced button hover solid
--warp-button-text-hover on --warp-button-bg-hover is 2.10:1, needs 4.5:1
```

Do not silently alter an explicit part or raw-token colour to fix D010. The roadmap config is
API syntax, not an exemption: its pinned `ink` label or sweep text may fail in dark mode. The
live editor shows that failure and offers a valid adaptive family rather than claiming a pass.
The no-config branch keeps the canonical contrast tests and their expectations untouched.

## Runtime palettes and tones

Add `palette` to the dial API. `setDial('palette', 'ocean', { persist: true })` synchronously sets
`data-palette="ocean"` before it returns; all theme CSS is already loaded. Keep the transition
callback's write-once contract and the existing event shape. Add `?palette=` to `dialsFromUrl`.
`auto` removes the attribute and restores inheritance/config default; `default` explicitly selects
the base. Persistence keeps explicit `default` and removes `auto`, as with the existing dials.

Keep existing dial unions narrow; only `DialValue<'palette'>` admits dynamic strings. Emit safe
root metadata `--warp-palette-names` (the space-separated names including `default`) and
`--warp-palette-default` in the themed config CSS. Emit `--warp-palette-current` at the default
root and every palette/theme-tone boundary, including the unknown-name base reset. These values
are unquoted identifiers with the validated grammar. The palette setter validates against that
metadata after styles load; absent metadata allows only `default`/`auto`. Unknown values throw
RangeError before attributes, events, history or storage change. No new registry, listener,
network request or per-component reactive owner is needed. `getDial('palette', root)` reads the
effective palette marker from CSS, so an inherited/default palette is reported correctly; other
`getDial` semantics stay unchanged.

Root persistence continues using `warp:dials.palette`. A subtree call changes only that subtree;
for the new palette dial, `persist: true` or `url: true` on a non-document root throws before
changing anything, because there is no stable subtree identity in the current storage or query
format. No new storage key
or selector serialization is introduced.

Keep `dialScript`'s string export and support old stored dials. Whitelist recognized dial keys
and values; for palette accept only `auto` or a syntactically valid name. The head script cannot
read configured CSS metadata before styles load. A stale saved name is therefore restored but
the CSS unknown-palette rule resolves it to the base without a flash; after load the dial API
reports that effective base. Malformed JSON and blocked storage remain harmless. The app must
place `dialScript` in its blocking head before first paint, as today; without it, persistence
cannot promise a flash-free first paint. An explicit URL choice applied afterward wins.

Keep the six semantic `Tone` values for unrelated components. Add a documented `ThemeTone` for
Button, Badge, the new Pill/PillLink, Link and Nav; these accept semantic tones, configured colour
names or configured theme names and continue emitting `data-tone`. Do not widen every shared
`Tone` consumer. Generated selectors supply named-colour tone channels: solid/hover/on-solid,
soft/text/border, plus relevant sweep and indicator colours. A hex tone derives its family as a
seed; pinning an exact per-part colour uses `parts` instead. This distinction is documented.

A theme tone creates a palette boundary on that host through generated `[data-tone="ocean"]`
selectors and uses that theme's accent tone channels. It does not write global state. Include
these hosts in system re-derivation and slot resets. Explicit `data-palette` on the same host
wins its palette selection; `tone` still chooses its component's colour role. Descendants follow
the local palette until another boundary. A `subtle` Link with an explicit tone uses the tone's
text; without a tone it retains inherited ink. Nav tones colour its indicator and active text,
not unrelated descendant controls. Omitted tones keep existing markup and defaults.

The plugin rejects unknown configured references. A dynamic invalid `tone` string has no CSS
match and keeps the component's default paint; it does not interpolate a CSS declaration.
Document that runtime component strings cannot be checked against an app config by TypeScript.
Config-generated types are not required for this sprint.

## Tailwind

Keep `@weft-js/warp/tailwind.css` and its existing tokens unchanged for default consumers. When
themes/colours are enabled, alias that entry to a generated Tailwind entry containing the current
`@theme inline` block plus `--color-<name>: var(--warp-named-<name>)` for each configured colour.
Use a packaged template and a deterministic build-generated file selected by token aliases.
Add optional `tokens.cssEntries: Record<string, string>` to `Contributions` in
`packages/core/src/plugin.d.ts`. The writer in `packages/cli/src/plugins.mjs` emits each entry as
`.weft/tokens/<namespace>.<entry>.css`, with the same generated header and stale-file cleanup as
the primary CSS. Entry names match `[a-z][a-z0-9-]*`; reject separators and invalid types before
writing. The warp contribution supplies `{ tailwind: generatedCss }` and aliases
`@weft-js/warp/tailwind.css` to the absolute app-root path `.weft/tokens/warp.tailwind.css`, using
the contribution's existing `env.root`. The alias resolver in
`packages/core/vite/config-plugins.mjs` already resolves that file through `this.resolve`.
Do not alias to `weft:tokens/warp.tailwind`: `skipSelf: true` would skip the same resolver that
handles that virtual id. No resolver behaviour change or write to `node_modules` is needed.
Keep the type/writer extension separate from compiler/runtime work. Do not put `@theme` directives
in the ordinary runtime stylesheet: builds without Tailwind must remain valid.

`bg-brand` and `text-brand/80` read the nearest palette's named value. Theme replacement of
`colors.brand` changes utilities along with parts; opacity modifiers are Tailwind's normal colour
mixing. Part settings do not rename utilities or change named colours. Utilities retain their
existing layer priority over component defaults. A raw `bg-[#…]` still follows existing diagnostics.
Arbitrary combinations of user utilities are outside config D010; do not claim automatic contrast
validation for every possible utility pairing. The documented editor and examples use checked
pairs. Test this with the actual Tailwind processor, not only a string containing `@theme`.

## Follow-up ownership

These are disjoint change sets. Paths marked new are created by their owner. A later task reads
the preceding contract but does not edit its files. Regenerated CSS belongs to the source/build
owner only. Managers schedule dependencies and own shared measurement artifacts after integration.

| Owner | Exclusive files and acceptance |
| --- | --- |
| CSS source/build | `docs/design/warp/tokens/warp.css`, `warp-components.css`, `warp-inputs.css`, new `warp-links.css`; `packages/warp-core/scripts/split-css.mjs`, new `scripts/theme-css.mjs`, generated `packages/warp-core/styles/**`; `packages/warp/src/links.css`, new `src/links-themed.css`, `src/styles.ts`, `packages/warp/package.json`; `packages/warp-core/test/styles.test.ts`, new `test/theme-css.test.ts` and `scripts/theme-compat.mjs`. Own the token schema export used by other owners, exact legacy lowering, stable link export/import, alias path list, every paint site and byte fixtures. |
| Config/resolution | `packages/warp/plugin.mjs`, `plugin.d.mts`, new `src/plugin/themes.mjs`; `packages/warp/test/plugin.test.ts`, new `test/themes.test.ts`. Own merge, path validation, aliases, raw-token precedence, family resolution, card/default-palette consistency and updated agent hints. Consume the build owner's schema; do not copy it. |
| Contrast | `packages/warp-core/scripts/contrast-check.mjs`, `scripts/contrast-check-colors.mjs`, new `test/theme-contrast.test.ts`. Own expanded effective-state pairs and attributed failures; preserve the canonical tests' thresholds. Config owner calls this through its existing spawn boundary. |
| Runtime | `packages/warp-core/src/dial.ts`, new `test/palette.test.ts`, new `packages/warp/test/palette.browser.test.tsx`. Own metadata reads, runtime validation, URL/storage/head restoration cases and nested browser switching. Config owner owns the `dialScript` export text and delegates its contract fixtures to this owner before integration. No runtime owner edits `plugin.mjs`. |
| Components | `packages/warp/src/Button.tsx`, `Badge.tsx`, `Type.tsx`, `Nav.tsx`, new `Pill.tsx`, new `theme-tone.ts`, `src/index.ts`; new `packages/warp/test/theme-tone.test.tsx`. Own the five component tone surfaces, Pill/PillLink exports over existing pill CSS, public doc comments and no new owners/anatomy for existing components. |
| Tailwind entry/integration | `packages/warp/tailwind.css`, new `tailwind.template.css`, new `src/plugin/tailwind.mjs`; `packages/core/src/plugin.d.ts`, `packages/cli/src/plugins.mjs`, `packages/cli/test/plugins.test.ts`; new `packages/warp/test/tailwind-theme.test.ts`; new `packages/warp/test/e2e/theme-entry.mjs` and new `test/e2e/theme-entry/` fixtures. Own the secondary CSS entry writer/type, its rejection tests, actual module alias resolution, and real Tailwind processor fixture. Config owner imports this helper and supplies `tokens.cssEntries`; no other owner edits the writer. |
| Reference/site | `packages/cli/docs/design.md`, `site/content/learn/theming.md`; new `site/src/toolkit/Theming.tsx`, new `site/src/toolkit/docs/theming.ts`; `site/src/toolkit/docs/index.ts`, `site/src/routes/toolkit/[slug].tsx`, and `site/src/styles/toolkit.css` only for registering/styling the new page. Own copied config, light/dark preview, part/state editing, visible D010 failures and narrow-screen checks. Match existing toolkit controls and layout; do not redesign other pages. |

The Tailwind writer/type change lands before the config contribution uses `cssEntries`. Its
concrete deliverable is an aliasable `.weft/tokens/warp.tailwind.css` emitted by the normal token
writer, plus Node/Vite resolution tests. The CSS owner can proceed without this integration.
Runtime and components depend on the config metadata/schema; site work follows the validated
config/contrast API. Site editor errors must not
replace the last valid preview with an unchecked palette.

## Verification contract

T01 itself runs only its requested documentation checks:

```sh
test -s docs/decisions/theming.md && git diff --check
```

The following are exact commands for the follow-up implementation, not checks run by T01.
New script/test names are deliverables assigned above. Run focused checks in the owning ticket;
the manager runs heavy package/build/measurement work through PROTOCOL, after checking load and
space. No screenshot baselines are updated for the no-config branch.

```sh
node packages/warp-core/scripts/split-css.mjs --check
node packages/warp-core/scripts/theme-compat.mjs --baseline 5954f6ce
pnpm --filter @weft-js/warp-core exec vitest run test/theme-css.test.ts
pnpm --filter @weft-js/warp-core exec vitest run test/theme-contrast.test.ts
pnpm --filter @weft-js/warp-core exec vitest run test/palette.test.ts
pnpm --filter @weft-js/warp exec vitest run test/plugin.test.ts test/themes.test.ts
pnpm --filter @weft-js/warp exec vitest run test/theme-tone.test.tsx
pnpm --filter @weft-js/warp exec vitest run test/palette.browser.test.tsx
pnpm --filter @weft-js/warp exec vitest run test/tailwind-theme.test.ts
node packages/warp/test/e2e/theme-entry.mjs --baseline 5954f6ce
node packages/warp-core/scripts/contrast-check.mjs packages/warp-core/styles/warp.css --json
node packages/warp/scripts/size.mjs
node benchmarks/compare/measure.mjs
```

`theme-compat.mjs` compares every baseline tracked `packages/warp-core/styles/*.css` recursively,
the old manifest, and warp's bare-link and Tailwind entries against the candidate defaults. It
prints checked/expected counts derived from `git ls-tree -r --name-only 5954f6ce` and verifies the
candidate inventory against `git ls-files`; themed additions are listed separately. It must
fail on a missing file, extra legacy path, changed byte or absent baseline ref. Its
`--negative-control` mode changes one byte in a temporary candidate and exits nonzero. Prove it:

```sh
if node packages/warp-core/scripts/theme-compat.mjs \
  --baseline 5954f6ce --negative-control; then
  exit 1
fi
```

The ordinary-consumer fixture builds the same imports against baseline and candidate in one
owned staging root, pins the same compiler/toolchain, and compares concatenated emitted CSS
bytes with normalized asset filenames only. Exercise no plugin, `warp()`, empty new dictionaries,
and existing seed/token/dial configs; the latter compare like-for-like old configurations. The
themed fixture must prove aliases select part-aware sheets for ordinary imports, selective input
sheets, bare anchors and the Tailwind entry. Also pack/install the published exports in the
manager's release gate; a workspace-only resolver pass is not package proof.

Negative tests include an unknown part/property/state, unknown colour, cyclic alias, nonfinite
family, dictionary collision, invalid palette, and a low-contrast pair in every part/state family.
Each must fail without suppressing unrelated pairs. Browser tests hold a frame/fill sweep active,
switch ocean to sunset and assert stroke, base, resting label and active text, plus Nav's two
indicators, Tabs, links, pills and fields. Check nested palette/dial order, root and subtree
reset, light/dark, persistence on reload before first paint, stale storage, blocked storage,
unknown setter atomicity, forced colours and reduced motion. Existing no-config screenshots and
interaction tests remain untouched and must pass.

The manager also runs the affected package tests, type/lint checks and integration gate. It
commits the all-stack comparison history and regenerated chart once the integrated source is
measured, as CONTRIBUTING requires. Every new scenario runs across weft + warp, Solid,
React + Radix, React + Zustand and React + MUI. Record size and speed results; this design makes
no size or speed claim. Clean owned staging and stop owned test processes after verification.
