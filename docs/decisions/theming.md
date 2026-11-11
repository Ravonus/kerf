# Theme tokens and compatibility

Sprint 8 design, 2026-11-08. This decision defines the implementation contract. It does not
implement the API or claim that its checks have passed. The source baseline is `90fbeee3`
(Sprint 8 after the scope amendment).

This revision follows `/Users/ravonus/dev/kerf-orchestra/sprints/S8/NOTICE.md` and the Sprint 8
section read from `origin/main:docs/ROADMAP-1.0.md`. It supersedes the colour-only contract in
the first T01 commit. Implementation is still unstarted.

## Existing contracts

- `packages/veneer/plugin.mjs` validates options with paths, fits seed hues, and runs D010. Its
  `SCOPES` reapply overrides wherever the system tokens are derived. The current D010 filter can
  exclude light/dark and expression stops through `dials`; that is insufficient for named themes
  which can appear anywhere in the document.
- `packages/veneer-core/scripts/split-css.mjs` generates `styles/` from
  `docs/design/veneer/tokens/`. Changing only generated component CSS is not a source change.
  `build()` and `--check` compare the generated strings, including comments and whitespace.
- `packages/veneer-core/styles/veneer.css` defines layers, system tokens, the sweep, label colours and
  focus rings. Button also paints through tone channels, pseudo-elements, relative colours and
  highlight mixes. Replacing its first `background` declaration does not theme its animated fill.
- Nav paints both a moving indicator and a pre-script current-link indicator. Tabs has line,
  enclosed and pill variants. Link paints its underline with `currentColor`. Pill already has
  stylesheet rules, but there is no exported `Pill` component in the current veneer entrypoint.
- `packages/veneer-core/src/dial.ts` writes attributes synchronously, stores root choices under
  `veneer:dials`, and announces `veneer:dial`. `dialScript` restores those choices before first paint.
- `packages/veneer/tailwind.css` uses `@theme inline` so utilities read tokens at the element.
  `Contributions.tokens.alias` in `packages/core/src/plugin.d.ts` already supports selecting a
  different module at build time. No compiler or core plugin API change is needed for CSS selection.

Default dimensions, typography, DOM anatomy, controls, focus behaviour, motion and timing stay
as they are. No existing screenshot or contrast expectation changes to accept this work.

## Configuration and names

Keep the roadmap's `veneer({ system, colors, seed, parts, themes, dials })` shape. Add these types
to `plugin.d.mts`; the implementation accepts plain objects only:

- A colour is `#rrggbb`, a colour name, readable raw CSS colour, or `{ hue, chroma }`.
  Hue is finite and in `[0, 360)`;
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
- A named theme accepts only `system`, `seed`, `colors`, `parts`, and `tokens`. `fields`, `dials`, `radius`,
  `fonts`, nested `themes`, and `extends` are errors there. The existing app-wide options remain.

Resolve a named colour in the effective theme's dictionary, then the built-ins. A theme name is
valid only in `dials.palette`, `tone`, and palette attributes; it is not a colour in `parts` or
`seed`. Reject unknown top-level keys, part names, states, properties, colour names and palette
defaults. Keep P115 and the exact offending path, for example:

```text
parts.button.hover.bg: unknown colour `brnad`;
  use a colour name or #rrggbb
themes.ocean.parts.nav.pressed: unknown state;
  use hover, focus, active, disabled
colors.brand: colour cycle brand -> orange -> brand
dials.palette: unknown theme `oceen`; use default, ocean, sunset
```

Raw high-level colours must parse and resolve through the same checked colour grammar as D010
(hex, oklch, light-dark, supported colour-mix and known veneer references). An alias used as a
seed must resolve to a hex/family; a conditional raw colour is a seed path error. Keep `tokens`
as the existing raw CSS escape hatch with its safety checks. Known colour-bearing raw tokens,
including the new part tokens, must be readable by D010. An unresolved expression in a checked
pair is an error, never an omitted pair or a passing result. Unknown custom `--veneer-*` tokens
retain today's validation; an unused custom property does not itself constitute a colour pair.

### Exact colours and hue families

A hex colour in `parts` or a named utility is exact in both modes. Do not silently fit it. A hex
in `seed` still selects a hue family and prints where the fitted accent lands, as it does now.
Named aliases preserve this distinction: `seed.accent: 'brand'` fits; `button.bg: 'brand'` pins
the hex. This also avoids the current seed normalization treating a family object as a string.

A hue/chroma colour defines an adaptive family, since it supplies no lightness. Reuse the
existing seed fitting and gamut mapping, with the canonical role's lightness at each expression
and mode. Generate solid, solid-hover, on-solid, soft, text, border, sweep, label-rest and
label-active roles. Use solid for a fill or indicator, solid-hover for its hover fill, on-solid
for text on a solid, text for ordinary text, border for an edge, sweep for a stroke, and the
label roles for labels. The unfilled sweep's active copy uses text; the filled copy uses
on-solid. D010 checks both. This is role resolution, not permission to repair a failing
explicitly pinned colour.

The public utility value is `--veneer-named-<name>`: a literal for hex colours, the family's solid
role for hue/chroma colours. Internal family role tokens use `--veneer-named-<name>-<role>`.
Resolve aliases before emission, and sort names for deterministic output.

## Part and state tokens

The spelling is `--veneer-<part>-<property>[-<state>]`. The following table records the required
colour aliases; the registry tables below extend it to every token consumer and every value
family. Top-level properties are resting settings. No `rest` object is accepted.

<!-- veneer-theme-schema:begin -->

| Part | Resting properties | State properties | Token examples |
| --- | --- | --- | --- |
| `button` | `bg`, `text`, `border`, `highlight` | `hover`, `focus`, `press`, `disabled`: `bg`, `text`, `border`, `highlight` | `--veneer-button-bg`, `--veneer-button-text-hover`, `--veneer-button-highlight-press` |
| `sweep` | `stroke`, `base`, `label`, `text` | `invalid`: `stroke`, `label`, `text` | `--veneer-sweep-stroke`, `--veneer-sweep-base`, `--veneer-sweep-label`, `--veneer-sweep-text`, `--veneer-sweep-stroke-invalid` |
| `nav` | `text`, `underline` | `hover`, `focus`, `active`, `disabled`: `text`, `underline` | `--veneer-nav-underline`, `--veneer-nav-text-active` |
| `tabs` | `text`, `underline` | `hover`, `focus`, `active`, `disabled`: `text`, `underline` | `--veneer-tabs-underline`, `--veneer-tabs-text-focus` |
| `link` | `text`, `underline` | `hover`, `focus`, `press`, `disabled`: `text`, `underline` | `--veneer-link-text`, `--veneer-link-text-hover` |
| `pill` | `bg`, `text`, `border` | `hover`, `focus`, `active`, `disabled`: `bg`, `text`, `border` | `--veneer-pill-bg`, `--veneer-pill-text-active` |
| `badge` | `bg`, `text`, `border` | none | `--veneer-badge-bg`, `--veneer-badge-text` |
| `field` | `label`, `bg` | `floated`: `label`; `hover`, `focus`, `invalid`: `label`, `bg`; `focus`, `invalid`: also `ring`; `disabled`, `readonly`: `label`, `bg` | `--veneer-field-label`, `--veneer-field-label-floated`, `--veneer-field-label-focus`, `--veneer-field-ring-focus` |
| `focus` | `ring` | none | `--veneer-focus-ring` |

`nav.underline`, `tabs.underline` and `link.underline` accept the original colour scalar or `{
color, width, offset }`. A scalar normalizes to `{ color: value }`. The colour keeps
`--veneer-nav-underline` (and its tabs/link equivalents); width/offset use
`--veneer-nav-underline-width` and `--veneer-nav-underline-offset`, with state last. Reject mixed
scalar/object siblings for the same normalized leaf. Width is thickness; offset is the gap to
the existing track/underline, not its axis length. Map both Nav indicators on both axes. For
Link, offset maps text-underline-offset and the existing gradient placement. The pill Tabs
variant retains its filled indicator. Do not make a new underline in variants without one.

`border` accepts a colour scalar (the earlier colour shorthand), a raw border shorthand such as
`none`, or `{ color, width, style }`. `ring` accepts a colour scalar or `{ color, width, offset
}`. Normalize all three objects to leaves before merging. A state's object can replace only
colour and retain its inherited width. The shorthand and equivalent longhand set in the same
object are a path error; do not make object enumeration order decide which wins.

Two explicit binding exceptions keep the roadmap examples meaningful: `sweep.width` sets sweep
stroke thickness, not host inline-size; `sweep.duration` controls its existing clocks, not a new
animation. Root `font` settings target the component's existing text role and inherit through
its owned label; specific label/floated-label records can override that role.

The expansion rule makes every token name exact: for instance, every `button.hover` property is
`--veneer-button-<property>-hover`, without aliases such as `fill`, `fg`, or `pressed`.
`sweep.label` is the resting frame label. `sweep.text` is the copy revealed while the sweep
runs, including the filled-frame copy. It is deliberately different from a field's label. The
existing `--veneer-sweep-fill` remains a raw token; it is not renamed or stripped by the build.

`press` means a physical press (`:active` or the existing `data-press`), for Button and Link.
`active` means current/selected/toggled (`aria-current`, `aria-selected="true"`,
`aria-pressed="true"`) for Nav/Tabs/Pill and other consumers with those selectors. These are
different states. Do not reinterpret CSS `:active` as config `active`. Focus means
`:focus-visible`, or `:focus-within` for a field. Hover keeps existing pointer media guards. A
field is floated when the existing filled/date/lift selectors say so. Invalid and disabled
states keep their existing selectors, double borders, opacity and motion suppression.

When states overlap, colour precedence is disabled, invalid (fields/sweeps), press, active,
focus, hover, floated, rest. That order concerns supplied colours only. Preserve existing
geometry and animation precedence. A missing state property reads the local resting property,
inherited state/resting inputs, then the exact old expression for that paint site. Invalid
label/stroke/ring properties are the exception: without an explicit invalid setting they retain
their critical fallback, bypassing ordinary resting/hover/focus overrides. A missing resting
property reads the old expression. Do not place local fallback expressions in `:root`: they must
resolve on their original host.

### Default paint sites

These are fallbacks, not replacement colour constants. Keep the original expression at every
site, including its tone channels, `currentColor`, opacity, mix, and light/dark dependencies.

| Paint | Existing fallback and required coverage |
| --- | --- |
| Button fill, ink, border | `--veneer-tone-fill/ink/edge` over `--_fill/ink/edge`; preserve primary roles for a button without an explicit tone, and soft/outline/ghost/frame/link emphasis |
| Button animated fill | `--_layer`, `--_pa`, `--_pb`, their highlight mixes and relative-colour branch; supplied state `bg` must colour every visible fill stop, not only the host background |
| Button highlight | `--veneer-color-highlight-solid` at each mix; without an override the entire mix stays byte-for-byte intact |
| Sweep stroke and base | `--veneer-color-sweep`, tone/field `--_tint` and `--_base`, `--veneer-color-sweep-base`; also frame corners and all six outline segments |
| Sweep label and active text | `--_tone` over accent-text at rest; text for an unfilled copy; `--_tone-ink` over on-solid for a filled copy |
| Invalid sweep | critical-solid stroke and critical-text label; ordinary sweep settings cannot erase the invalid treatment |
| Nav | subtle text at rest, text on hover/focus/current; accent-solid for both moving and pre-script indicators, on both axes |
| Tabs | subtle text at rest, text on hover/selected; accent-solid for the line/enclosed indicator; retain raised-surface fill for the pill indicator |
| Link | accent-text, inherited ink for `subtle`, and currentColor for the underline/gradient; cover bare anchors in `veneer/src/links.css` as well |
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

## Registry, system scale and value domains

The tables between `veneer-theme-schema` markers are machine-readable design input. The follow-up
schema generator reads these tables from this file; no second hand-written schema is created. It
parses canonical CSS with a CSS/selector parser and expands the consumer rules into records: `{
part, subpart, path, state, token, domain, units, selector, atRules, source, fallbackSpan }`. A
consumer is an actual declaration, including transitive local tone channels, shorthand
components and pseudo-elements. A name seen only inside `:not()` or `:has()` is not
automatically the styled owner. Choose the rightmost styled scope, retain ancestor constraints
and preserve selector lists. Global type roles, sweep parts and bare anchors have explicit
records below.

This file is the authority for exposed names/domains; canonical CSS is the authority for exact
bindings and fallbacks. The generator rejects an unclassified consumer, unsupported table path,
duplicate output token, source binding that matches nothing, and missing fallback. It emits
`packages/veneer-core/theme.schema.json`, the entire `packages/veneer/plugin.d.mts` from a template,
and `packages/cli/docs/theme-tokens.md`. The generated docs expand every part/property/state
record, including its custom property, unit, source and fallback. All three outputs contain the
same schema digest. `--check` regenerates in memory and compares bytes. Types have finite part
and state keys; no `Record<string, unknown>` escape can hide an unknown part/property/state.
User scale names use typed dictionary values. Runtime validation consumes the generated JSON,
not a parallel switch statement. The site/reference page uses the generated reference table.

The inventory table below gives all root scope names and their observed property/state/subpart
candidates. The parser narrows these to the exact styled owner and source predicate when
expanding records. It must report every candidate it excludes and why; it cannot silently skip
negative/query-only selectors. A root setting affects its own paint and owned descendants,
ending at a nested different component scope. `parts['field/label']` addresses that actual
subpart; it does not collide with the scalar `parts.field.label` colour alias. Its token prefix
is `--veneer-field--label-`, with double hyphens separating scope and subpart. Standalone
`[data-part]` hosts use the `part/<name>` namespace and `--veneer-part--<name>-` prefix.
Scope-free foundations use `root`; type role settings use `text/<role>`. No new component export
is implied by a stylesheet scope, including the marketing specimens. Existing shipped families
stay shipped; marketing source-only records are labelled source-only in generated docs, not
advertised as importable component APIs. Do not introduce a marketing runtime to satisfy a
schema row.

### System table

`keys` enumerates existing keys or an explicit expansion over actual token definitions. New
user-defined scale keys are allowed only in space, radius, font, shadow and text dictionaries;
they do not add JSX prop values to components with a closed intent-prop union.

| system path | keys | domain | binding |
| --- | --- | --- | --- |
| space | hair,tight,related,group,section,page; user keys | space | --veneer-space-<key>; numeric key 2 is a name, not a multiplier |
| radius | control,surface,card,mark,round,pill; user keys | radius | card aliases surface; pill aliases round; reject both aliases set differently |
| font | body,display,mono; user keys | family | body aliases --veneer-font-sans; other existing keys keep --veneer-font-<key> |
| text | display,title,heading,body,prose,label,eyebrow,caption,code,control,button; user keys | text-role | existing --veneer-text-<role>-*; only fields with a real role consumer |
| shadow | none,sm,md,lg; user keys | shadow | none/sm/md/lg alias --veneer-elevation-0/1/2/3 |
| border | hairline,emphasis | width | --veneer-border-hairline/emphasis |
| focus | width,offset,color | focus-role | --veneer-focus-width/offset and --veneer-color-focus |
| padding | control,surface | space | --veneer-pad-control/surface |
| control | sm,md,lg | length | --veneer-control-sm/md/lg; preserve existing hit-area floor in final size |
| field | height | length | --veneer-field-height; preserve existing target-min floor |
| density | compact,cozy,comfortable | density-role | factor -> --veneer-density-k; control.sm/md/lg -> --veneer-ref-control-* at that stop |
| motion.duration | every actual --veneer-duration-* and --veneer-*-duration token | time | token basename is key; instant/fast/base/slow plus fill,spring,touch-out,sweep,frame,label-float,label-char,message and declared family durations |
| motion.easing | every actual --veneer-ease-* plus sweep,sweep-in,label-float | easing | exact existing ease/sweep-ease/label-float-ease token |
| motion | scale,press,stagger,stagger-max,distance,scale-from | motion-role | existing motion-scale,press,stagger,stagger-max,motion-distance,motion-scale-from; reduction still wins |
| layout | bar,tabbar,rail,sidebar,list,aside,measure,narrow,content,wide | length | --veneer-layout-<key> |
| breakpoint | each existing width query, keyed by source family/container/operator/default threshold | build-length | rewrite only that recorded query; never substitute all equal numbers |
| color | every existing --veneer-color-* token suffix | color | existing semantic colour scale; same checks as tokens; colors is the named dictionary |

A `text-role` object has the property-table font fields that exist for that role. `density-role`
is `{ factor, control: { sm, md, lg } }`, not an arbitrary CSS object. `motion-role` fields use
the property domains below: scale/press/scale-from are numbers, stagger is time, stagger-max is
a nonnegative integer, distance is a length. A focus role has width/offset/colour. The default
space values remain the existing density/air formulas; an explicitly assigned scale value is
exact and is not multiplied a second time. A custom space key has no hidden density multiplier.
The existing compact/cozy/comfortable factors are 0.75/1/1.25 and reference control sizes are
24/32/40, 28/36/44 and 32/40/48 px respectively (`veneer.css:331-341`).

### Property table

Each path expands only for an actual matching consumer in the inventory. Logical CSS longhands
use their camelCase names (`paddingInline`, `marginBlockEnd`, `maxInlineSize`, etc.). The rows
with a family of properties enumerate the family by the inventory's actual CSS spelling, not by
arbitrary strings. `font` also accepts a family scalar, normalizing to `font.family`.

| config path | CSS binding or role | domain | number unit |
| --- | --- | --- | --- |
| bg | background/background-color fill channels | color | forbidden |
| text,label,highlight,stroke,base,shadowColor | corresponding paint/label/outline/shadow colour sites | color | forbidden |
| underline | scalar colour or object color,width,offset | underline-role | width/offset px |
| border | border shorthand; none is valid | border | px width only |
| borderColor and actual logical border colour longhands | border-color and inventory matches | color | forbidden |
| borderWidth and actual logical border width longhands | border-width and inventory matches | width | px |
| radius and actual logical corner radius longhands | border-radius and inventory matches | radius | px |
| padding and actual logical padding longhands | padding and inventory matches | space | px |
| margin and actual logical margin longhands | margin and inventory matches | margin | px |
| gap,rowGap,columnGap | gap,row-gap,column-gap | space | px |
| height,width,minHeight,maxHeight,minWidth,maxWidth | block-size,inline-size,min/max logical sizes | length | px |
| actual inset longhands | inset,inset-block/inline and start/end variants | position | px |
| font.family | font-family or family component of font | family | forbidden |
| font.size | font-size or size component of font | font-size | px |
| font.weight | font-weight or weight component of font | weight | unitless |
| font.lineHeight | line-height or leading component of font | leading | unitless |
| font.letterSpacing | letter-spacing | tracking | px |
| font.transform | text-transform | transform-case | forbidden |
| font.style,font.variantNumeric,font.variation | font-style,font-variant-numeric,font-variation-settings | matching CSS grammar | forbidden |
| font.css | original complete font shorthand | font-shorthand | forbidden |
| shadow | box-shadow; named elevation or raw list | shadow | forbidden |
| ring.color,ring.width,ring.offset | outline/sweep focus indicator components | color,width,position | width/offset px |
| duration,easing,stagger | existing transition/animation/sweep time/ease/delay components | time,easing,time | ms for times |
| hoverDuration,pressDuration,enterDuration,exitDuration | corresponding recorded motion channel, not a whole transition string | time | ms |
| animation | false disables recorded visual motion; true restores source motion | boolean | forbidden |
| scale,opacity | scale,opacity at corresponding state | scalar | unitless |
| translate,rotate | existing translate/rotate components | position,angle | px,deg |
| backgroundImage | existing gradient image sites | gradient | forbidden |
| backgroundSize,scrollMarginBlock,scrollPaddingInline | exact existing consumer grammar | length-list | px |
| fill,caretColor,accentColor,outlineColor,textDecorationColor,scrollbarColor | actual matching colour consumers | color or colour-list | forbidden |
| strokeWidth,textDecorationThickness | actual stroke/underline thickness | width | px |
| blur | blur component of existing filter/backdrop-filter | length | px |
| depth | z-index consumer where it is a public depth token | integer | unitless |

This JSON table supplies the mechanical expansion rules; the generator does not interpret
English in the explanatory binding cells. Property families expand against the finite native
properties in the consumer inventory, then apply these renames. Font/ring/underline/border
subfields use the preceding explicit rows. Required colour aliases use their Part table.

```json
{
  "version": 1,
  "nativeNames": "kebab-to-camel",
  "tokenNames": "camel-to-kebab-state-last",
  "subpartSeparator": "--",
  "existingTokenCollision": "insert-local-after-part",
  "families": [
    "padding-*", "margin-*", "inset-*",
    "border-*-color", "border-*-width", "border-*-radius"
  ],
  "rename": {
    "background-color": "bg",
    "border-radius": "radius",
    "box-shadow": "shadow",
    "block-size": "height",
    "inline-size": "width",
    "min-block-size": "minHeight",
    "max-block-size": "maxHeight",
    "min-inline-size": "minWidth",
    "max-inline-size": "maxWidth",
    "font-family": "font.family",
    "font-size": "font.size",
    "font-weight": "font.weight",
    "line-height": "font.lineHeight",
    "letter-spacing": "font.letterSpacing",
    "text-transform": "font.transform",
    "font-style": "font.style",
    "font-variant-numeric": "font.variantNumeric",
    "font-variation-settings": "font.variation",
    "font": "font.css"
  },
  "units": {
    "length": "px", "space": "px", "margin": "px",
    "width": "px", "radius": "px", "position": "px",
    "font-size": "px", "tracking": "px",
    "time": "ms", "angle": "deg",
    "weight": "number", "leading": "number",
    "scalar": "number", "integer": "number"
  },
  "stateKeys": [
    "disabled", "invalid", "press", "active", "open",
    "checked", "focus", "hover", "floated", "readonly"
  ]
}
```

For example `padding-inline` maps to `paddingInline` and then `--veneer-button-padding-inline`;
`font.weight` maps to `font-weight`. A candidate name already declared in canonical CSS gets
`local-` after its part prefix, so `parts.sweep.width` uses `--veneer-sweep-local-width`,
`sweep.duration` uses `--veneer-sweep-local-duration`, and field height uses
`--veneer-field-local-height`. Keep the existing `--veneer-sweep-width`, `--veneer-sweep-duration`,
and `--veneer-field-height` as inherited raw/system inputs. Never register, strip or reinterpret a
pre-existing property as a new noninheriting local slot. The expanded generated reference lists
every collision result, so authors need not infer this rule.

The remaining observed motion/mechanical properties (`animation-name`, `animation-range`,
`animation-play-state`, `stop-opacity`, `stroke-dashoffset`, `clip-path`, `transform-origin`,
`grid-template-columns`, `text-box`, `text-wrap-style`, full
`transform`/`transition`/`animation` strings) are not arbitrary new high-level knobs. Their
reasonable input tokens remain in the system table or the raw-token escape hatch. The generator
records each such consumer as system-driven or measured/state geometry and emits that reason in
its inventory. It cannot expose layout measurements, selector state, accessibility anatomy,
safe-area/keyboard/viewport inputs, `--_a`, sweep clocks/edges, or registered canvas outputs as
writable theme scale entries. This separates real styling inputs from computed runtime state
without removing raw `style`.

### State table

All applicable property paths are available in each listed state only where the target has the
corresponding existing selector/behaviour. State matching preserves the full selector and parent
conditions; it never manufactures an open, checked or selected state for an unrelated scope.

| state | positive source predicate | precedence |
| --- | --- | --- |
| disabled | :disabled,aria-disabled=true,data-disabled | 1 |
| invalid | data-invalid,aria-invalid=true | 2 |
| press | :active,data-press | 3 |
| active | aria-current,aria-selected=true,aria-pressed=true,data-active,data-state=active | 4 |
| open | aria-expanded=true,data-state=open,data-open,:popover-open,dialog open | 5 |
| checked | :checked,data-on,aria-checked=true | 6 |
| focus | :focus-visible,:focus-within,:has(:focus-visible) | 7 |
| hover | :hover with its original pointer guard | 8 |
| floated | field data-filled/date/lift and existing non-placeholder selectors | 9 |
| readonly | data-readonly,:read-only | 10 |
| rest | original unqualified/variant rules | 11 |

Other actual state attributes remain exact variant constraints (loading, valid, busy,
orientation, size, emphasis, ready, etc.), recorded alongside selectors. They do not become
arbitrary config keys. If one requires an exposed style channel, name and add its explicit
predicate row here before implementation, with evidence. Source state overlap retains its visual
rules: precedence orders conflicting supplied values, not disabled opacity, focus outlines or
control geometry.

### Canonical consumer inventory

This bounded source inventory counts declarations with a direct `var(--veneer-*)` read, including
custom-property assignments. It is lexical evidence, not a browser or ownership proof. There are
13 source files, 481 distinct declared public-token names and 359 distinct scope names
(including the type shim). The source-aware generator also follows local `--_` channels; a dash
in the direct-property column does not mean the component cannot be themed. State and subpart
columns are observed selector candidates, including ancestor/negative tests, not permission to
turn those tests into a new state. The State table and positive styled-owner analysis decide the
expanded API. The generated reference prints the exact positive predicates, not these
candidates.

| source | scope names | direct token-read declarations |
| --- | --- | --- |
| `docs/design/veneer/tokens/veneer-app.css` | 78 | 939 |
| `docs/design/veneer/tokens/veneer-canvas.css` | 3 | 33 |
| `docs/design/veneer/tokens/veneer-components.css` | 80 | 937 |
| `docs/design/veneer/tokens/veneer-data.css` | 40 | 724 |
| `docs/design/veneer/tokens/veneer-flows.css` | 36 | 341 |
| `docs/design/veneer/tokens/veneer-inputs-rich.css` | 30 | 606 |
| `docs/design/veneer/tokens/veneer-inputs.css` | 41 | 579 |
| `docs/design/veneer/tokens/veneer-layout.css` | 40 | 667 |
| `docs/design/veneer/tokens/veneer-marketing.css` | 71 | 958 |
| `docs/design/veneer/tokens/veneer.css` | 48 | 442 |
| `packages/veneer/src/links.css` | 0 | 2 |
| `packages/veneer/src/type.css` | 1 | 37 |
| `packages/veneer/src/layout.css` | 0 | 1 |
| Total (scope names overlap) | 359 distinct | 6266 |

Family names in the last column refer to the corresponding canonical `veneer-<family>.css`; `veneer`
is foundations and `shim-*` is `packages/veneer/src/*.css`. Root parts plus observed subparts
expand into finite schema entries; they are not wildcard component names.

| scope or standalone part | direct CSS properties | observed states | observed subparts | sources |
| --- | --- | --- | --- | --- |
| `accordion` | background,block-size,border,border-block-end,border-block-start,border-radius,border-width,color,font,gap,inset,min-block-size,padding-block,padding-block-end,padding-inline,transition | hover,open | chevron,content,item,root,sweep,trigger | components |
| `activity` | background,color,font,font-size | - | - | app |
| `activity-feed` | gap | - | - | app |
| `agenda` | animation,background,block-size,border-block-end,border-block-start,border-radius,box-shadow,color,font,grid-template-columns,letter-spacing,min-block-size,padding,scale,transition | active,floated,press | day-title,free,now,page,root,row,strip,track | app |
| `ai-label` | background,border,border-radius,color,font,inset | - | anchor,toggle | components |
| `alert` | background,border,border-radius,box-shadow,color,gap,line-height,margin-block-start,padding,padding-inline-end | - | actions,description | components |
| `anchor-heading` | animation,color,inset,transition | hover | anchor,toggle | components |
| `anchor-nav` | background,border,border-inline-start,border-radius,color,font-family,font-size,inline-size,inset-inline-start,letter-spacing,margin,min-block-size,padding-inline,text-transform,transition | active,hover | label | layout |
| `announce` | background,color,font-size,gap,padding | - | - | marketing |
| `announcement` | background,block-size,color,font-size,gap,inline-size,inset-block,padding | - | dismiss | layout |
| `announcer` | - | - | - | components |
| `api-key` | color,font | - | info,prefix | flows |
| `artifact` | background,border-block-end,border-inline-start,border-radius,box-shadow,font | - | head,preview | app,veneer |
| `assistant` | animation,background,border-radius,box-shadow,color,font-size,line-height | active | actions,content,mark,token | app |
| `auth` | background,border,border-block-start,border-radius,box-shadow,color,font,font-family,font-size,font-style,font-weight,gap,inline-size,letter-spacing,padding,padding-block,text-decoration-color,text-decoration-thickness | - | brand,divider,fine,lede,logo,main,panel,row,title | flows |
| `auto-track` | color,font-size | - | - | app |
| `autosave` | color,font-size | - | - | inputs |
| `availability` | background,border-block-end,border-radius,color,font-size,gap | - | day,error,off,overrides | app |
| `avatar` | background,border-radius,box-shadow,color,font,inset-block,transition,translate | hover | presence | app,components,data |
| `avatar-group` | box-shadow,inset-block,transition,translate | hover | more | components,data |
| `avatar-stack` | background,border-radius,box-shadow,color,font | - | more | app |
| `back-to-top` | animation,background,block-size,border,box-shadow,color,inline-size,inset-block-end,margin-inline-end | - | - | layout |
| `backdrop` | animation,backdrop-filter,background,border,border-radius,color,font,font-size,letter-spacing,padding,z-index | - | state | components,marketing |
| `backdrops` | gap | - | - | marketing |
| `badge` | animation,border,border-radius,box-shadow,font-family,font-size,inset-block-end,inset-inline-start,letter-spacing,text-box,text-transform | - | eyebrow | app,components,marketing,veneer |
| `banner` | animation,border,border-block-end,border-inline-start,border-radius,color,font-size,gap,padding | - | actions | components,layout |
| `bar-list` | animation,animation-delay,background,border-radius,font-size | - | - | data |
| `bell` | box-shadow,inset-block-end,inset-inline-start | - | - | app |
| `bento` | gap | - | - | marketing |
| `block` | background,border-block-start,color,font-family,font-size,font-weight,gap,letter-spacing,line-height,margin-block-end,padding-block,padding-inline | - | eyebrow,head,lede,title | marketing |
| `blog` | gap | - | - | marketing |
| `blog-foot` | margin-block-start | - | - | marketing |
| `board` | background,border,border-radius,box-shadow,font-size,gap,inset-block,outline,padding,padding-inline,transition | - | body,handle,resize,widget | layout |
| `booking` | background,block-size,border-radius,color,font,gap | active,checked,disabled | root,slot,slots,sweep | app |
| `branch` | background,block-size,border-radius,color,font,inline-size,opacity,outline | disabled,focus,hover | - | app |
| `breadcrumb` | background,border-radius,color,transition | active,hover | - | layout |
| `breadcrumbs` | background,border-radius,color,min-block-size,transition | active,hover | back,ellipsis | components |
| `bulk-bar` | animation,background,border-radius,color,font-size,gap | - | - | flows |
| `button` | background,background-color,background-image,block-size,border,border-radius,box-shadow,color,font-family,font-size,font-weight,gap,inline-size,inset,inset-inline,letter-spacing,margin-inline-start,min-block-size,min-inline-size,opacity,padding-inline,scale,text-box,text-decoration-thickness,text-transform,transform,transition,transition-duration,translate | active,disabled,focus,hover,open,press | actions,bulk,close,eyebrow,footer,label,moves,status,sweep | app,components,data,inputs,inputs-rich,marketing,veneer |
| `button-group` | box-shadow,gap,inline-size,margin-inline-start | - | - | components |
| `calendar` | animation,background,background-color,background-image,block-size,border,border-block-end,border-block-start,border-inline-end,border-inline-start,border-radius,box-shadow,color,font,font-family,font-size,font-weight,gap,grid-template-columns,inset-block-start,letter-spacing,max-block-size,min-inline-size,outline,padding,padding-block-start,padding-inline,text-transform,transition | active,disabled,focus,hover,open | allday,allday-cell,caption,chip,col,cols,corner,day,day-cell,dayhead,draft,event,event-meta,event-start,event-time,event-title,foot,ghost,grid,gutter,gutter-label,head,hour,lane,lane-label,mini,mini-note,month,months,more,now,now-label,off-hours,rail,range-label,readout,resize,root,sources,timeline,top,tz,year-wrap | app,inputs-rich |
| `call-controls` | background,block-size,border-radius,box-shadow,color,font,gap,inset-inline-end,margin-inline-start,min-inline-size,padding,transition | active,hover | control,end,group,leave | app |
| `callout` | background,border-inline-start,border-radius,font-family,font-size,gap,letter-spacing,padding,text-transform | - | title | components |
| `canvas` | background,background-color,background-image,border,border-radius,box-shadow,inset-block-end,inset-inline-end,inset-inline-start | - | controls,minimap,viewport | canvas,layout |
| `card` | background,background-color,border-radius,box-shadow,color,font-size,outline,outline-offset,padding | focus,hover | card,node | data |
| `card-grid` | gap | - | - | data |
| `carousel` | background,block-size,border-radius,color,font,font-variant-numeric,gap,inline-size,transform,transition | active | controls,dot,fraction,progress,slide,viewport | marketing,veneer |
| `cart` | animation,background,border-block-end,border-block-start,border-radius,color,font-size,font-variant-numeric | - | check,line,pane,totals | marketing |
| `center` | padding-inline | - | - | layout |
| `changelog` | animation-name,animation-range,animation-timing-function,background,border,border-radius,color,font,font-family,font-size,gap,inline-size,inset-block-start,padding-block | - | card,head,item,knot,media,release,what,when | marketing,veneer |
| `chart` | animation,animation-delay,animation-name,animation-range,animation-timing-function,background,border,border-block-end,border-radius,color,fill,font,font-family,font-size,gap,stop-opacity,stroke,stroke-width,transition | active,focus | card,head,item,state,summary,svg,table | data,veneer |
| `checkbox` | background,border,border-radius,border-width,box-shadow,clip-path,color,column-gap,font-size,inset,line-height,min-block-size,opacity,outline,scale,stroke,transition | disabled,focus,hover,invalid,press | cell,control,hint,icon,mark,preview,select,sweep,sweep-base,track | app,components,data,inputs,marketing,veneer |
| `checklist` | animation,background,block-size,border,border-block-start,border-radius,box-shadow,color,font,font-size,gap,padding,text-decoration-color,transition | - | count,done,head,item,progress,title | flows |
| `checkout` | animation,background,border,border-radius,font,gap,min-block-size,padding,transition | - | layout,step-title,summary | flows |
| `checkpoint` | border-block-start,color,font | - | - | app |
| `chip` | background,block-size,border,border-color,border-radius,border-width,clip-path,color,font,font-size,gap,inset,inset-block,opacity,outline,padding-inline,scale,text-box,transition,transition-duration | active,checked,disabled,focus,hover,invalid,press | cell,control,eyebrow,icon,preview,sweep,sweep-base,track | components,data,inputs,inputs-rich,marketing,veneer |
| `chips` | color,font-size,outline | focus | clear | data |
| `choice` | color,font-size | - | - | flows |
| `choice-card` | background,border-radius,border-width,clip-path,color,font,font-size,gap,opacity,outline,padding,transition | checked,disabled,focus,invalid | cell,control,hint,icon,label,meta,preview,sweep,sweep-base,track | app,inputs |
| `cite` | background,border-radius,box-shadow,color,font,inset-block,inset-inline | hover,open | - | app |
| `click-ripple` | animation | - | - | app |
| `code` | background,border,border-radius,font | - | - | inputs-rich |
| `codeblock` | animation-name,animation-range,animation-timing-function,background,border,border-block-end,border-radius,box-shadow,color,font,font-family,font-size,transition | active,focus | card,file,head,item,lang,line | inputs-rich,veneer |
| `codetabs` | background,border,border-color,border-radius,box-shadow,color,font,min-block-size,outline | active,focus | - | inputs-rich |
| `color` | border-radius,box-shadow,gap,inset,outline,transition | checked,focus | area,area-thumb,swatch | inputs |
| `comment-anchor` | background,border-block-end | active | - | app |
| `comment-thread` | background,border-radius,box-shadow,color,font,outline,transition,translate | active,focus | comment,reply | app,veneer |
| `commit` | background,border-radius,box-shadow,color,font-family | - | - | app |
| `compare` | background,border,border-radius,box-shadow,color,font,inline-size,outline | focus | handle,tag | marketing |
| `compare-table` | background,border,border-block-start,border-radius,color,font-family,font-size,letter-spacing,text-transform | - | - | marketing |
| `comparison` | background,border-block-end,border-start-end-radius,border-start-start-radius,color,font,font-family,font-size,font-weight,letter-spacing,min-block-size,text-transform | - | no,section,yes | data |
| `composer` | background,border-radius,box-shadow,color,font,font-size,margin,min-block-size,padding-block | - | file,hint,quote-by,quote-draft,quote-text,send | app,veneer |
| `confetti` | z-index | - | - | marketing |
| `confirm` | background,border,border-radius,color,font-size,gap | - | control | flows |
| `confirmation` | gap | - | - | flows |
| `conflict` | background,border-radius,box-shadow,color,font | - | - | app |
| `conn` | animation,background,border-block-end,color,font-size | - | - | flows |
| `consent` | animation,background,border,border-radius,box-shadow,gap,inline-size,inset-block-end,inset-inline-start,padding,padding-block-end,z-index | - | actions | layout |
| `contact` | background,border,border-block-start,border-radius,box-shadow,color,font,font-size,gap,min-block-size,padding | - | aside,channels,consent,done,submit | marketing |
| `container-scroll` | background,border,border-radius,box-shadow,gap | - | device,intro,screen | marketing |
| `context-menu` | - | - | - | components |
| `context-meter` | color,font,stroke,transition | - | - | app |
| `conversations` | background,border-inline-end,border-radius,box-shadow,color,font | active,hover | side | app |
| `count-up` | - | - | - | data |
| `countdown` | animation,background,border,border-color,border-radius,color,font | - | colon,unit,value | components |
| `cover` | gap,min-block-size,padding-block | - | - | layout |
| `cropper` | background,border-radius,outline,transition | focus | frame,image | inputs |
| `cta` | background,border-radius,color,font-family,font-size,font-weight,gap,letter-spacing,padding | - | actions,title,weave | marketing |
| `cursor` | background,border-radius,color,font,stroke,transition | - | - | app |
| `cursors` | z-index | - | - | app |
| `delta` | border-radius,color,font-family,font-size | - | - | data |
| `desc` | border-block-end,color,font-size | - | - | data |
| `dialog` | animation,backdrop-filter,background,block-size,border,border-block-start,border-radius,box-shadow,color,font-family,font-size,font-weight,gap,inline-size,letter-spacing,line-height,margin-block,margin-block-end,margin-inline,padding,padding-block-start,scale,transform-origin,transition,translate | - | body,description,footer,header,mark,title | components |
| `diff` | background,border,border-block-end,border-radius,box-shadow,color,font,font-size | focus | body,head | inputs-rich |
| `disclosure` | border-radius,color,font,gap,min-block-size,padding-block,transition | open | chevron,content,trigger | components |
| `distribution` | border-radius,transition | - | bar | data |
| `dither` | background,color,font-family,padding,transition | - | - | canvas |
| `doc-tabs` | background,border,border-block-end,border-color,border-radius,color,font-size,inset,min-block-size,padding-inline | active,hover | close | layout |
| `docs` | gap,inset-block-start,max-block-size,max-inline-size,min-block-size,padding,padding-block-start | - | article,body,sidenav,toc | layout |
| `drawer` | - | - | - | veneer |
| `dropzone` | background,border-radius,border-width,clip-path,color,font-size,gap,padding,transition,translate | focus,invalid | cell,control,hint,icon,preview,sweep,sweep-base,title,touch,track | inputs |
| `edges` | inset-inline-start,transition | - | - | layout |
| `editable` | border-radius,border-width,clip-path,color,gap,min-block-size,transition | focus,hover,invalid | cell,control,icon,preview,sweep,sweep-base,track | inputs |
| `embed` | background,border,border-radius,color | - | consent,frame | inputs-rich |
| `emoji` | background,border-block-start,border-radius,color,font-size,min-block-size,outline | active,focus,hover | preview,tabs | inputs-rich |
| `empty-state` | color,font-family,font-size,font-weight,gap,letter-spacing,margin-block-end,margin-block-start,padding,stroke | - | actions,art,description,title | components |
| `error-summary` | animation,background,border,border-inline-start,border-radius,color,font-size,outline,outline-offset,padding | focus | - | inputs |
| `event-card` | background,border-block-start,border-radius,color,font,font-size,gap,padding-block-start | - | actions,title | app |
| `event-log` | animation,border-block-end,border-block-start,color,font | - | - | marketing |
| `fab` | background,border-radius,box-shadow,color,font-family,font-size,font-weight,gap,inset-block-end,inset-inline-end,letter-spacing,opacity,text-transform,transition,transition-timing-function,translate,z-index | hover | - | components |
| `facts` | background,border-radius,color,font-family,font-size,font-weight,gap,padding,transition,translate | - | fact | marketing |
| `fancy-presets` | gap | - | - | marketing |
| `fancy-stage` | background,border,border-radius,color,font | - | empty | marketing |
| `feedback` | color,font-size | - | thanks | inputs-rich |
| `field` | animation,animation-name,animation-range,animation-timing-function,background,background-color,block-size,border,border-block-start-color,border-color,border-radius,border-top-width,border-width,box-shadow,caret-color,clip-path,color,font-family,font-size,font-weight,gap,inline-size,inset,inset-block-end,inset-block-start,inset-inline-start,letter-spacing,margin-block-start,margin-inline-end,margin-inline-start,max-block-size,min-block-size,opacity,outline,padding,padding-block,padding-block-start,padding-inline,transition,transition-delay,transition-duration,transition-timing-function | active,disabled,floated,focus,hover,invalid,open,press | action,body,card,cell,clear,control,counter,end,error,head,hint,icon,indicator,input,item,label,mask,message,pick,prefix,preview,segments,spinner,status,step,stepper,steps,suffix,swatch-dot,sweep,sweep-base,track,trigger,value | app,components,data,flows,inputs,inputs-rich,marketing,veneer |
| `filter-panel` | accent-color,border-block-end,color,font,font-size,letter-spacing,min-block-size,opacity,outline,text-transform | focus | facet | data |
| `filterbar` | animation,background,block-size,border,border-inline-start,border-radius,color,font,min-block-size,min-inline-size,outline | focus | add,body,control,fchip,input,remove | inputs-rich |
| `float-panel` | animation,background,border,border-block-end,border-radius,box-shadow,font-size,gap,min-block-size,padding,padding-block-end,padding-inline,z-index | - | body,handle | layout |
| `flow` | animation,animation-delay,background,background-color,border,border-radius,box-shadow,font-size,inset-block,outline,stroke | active,focus,hover | card,handle,node,step | data,flows |
| `follow-flag` | background,border-radius,color,font,z-index | - | - | app |
| `footer` | border-block-start,color,font,font-family,font-size,gap,letter-spacing,min-block-size,padding,padding-block-start,text-transform | hover | base,inner,top,wordmark | marketing |
| `form` | animation-name,animation-range,animation-timing-function,backdrop-filter,background,border-block-start,color,column-gap,font-family,font-size,font-weight,gap,letter-spacing,margin-inline,padding,padding-block-start,z-index | - | actions,card,grid,head,item,section,section-head,status | inputs,veneer |
| `frame` | background | - | - | layout |
| `fx-pause` | - | - | - | marketing |
| `gallery` | animation-name,animation-range,animation-timing-function,background,border-radius,box-shadow,color,gap,outline,outline-offset,scale,transform,transition,translate | focus,hover | card,head,item,open,select | marketing,veneer |
| `gate` | backdrop-filter,background,border-radius,filter,font,padding | - | blocker,content | flows |
| `gate-badge` | - | - | - | flows |
| `gradient` | border,border-radius,box-shadow,gap,inset,outline | active,focus | preview,stop | inputs |
| `grid` | gap,grid-template-columns | - | - | layout |
| `group` | color,column-gap,font-family,font-size,font-weight,gap,letter-spacing,margin-block-end,opacity | invalid | choices,control,description,items,label,message | app,inputs |
| `hero` | background,block-size,border,border-radius,color,column-gap,font-family,font-size,font-variation-settings,font-weight,gap,letter-spacing,line-height,margin-block-end,margin-block-start,padding,padding-block,padding-block-start,text-box | hover | actions,announce,copy,inner,lede,proof,title | marketing,veneer |
| `histogram` | background,transition | - | - | inputs |
| `hover-card` | background,border,border-radius,box-shadow,color,font-size,gap,line-height,padding,scale,transform-origin,transition,translate | open | content | components |
| `hover-scope` | background,border-radius,color,font-size,gap,outline,transition | focus,hover | text | inputs |
| `icon-grid` | border-radius,color,font | - | - | components |
| `icon-tile` | background,border-radius,border-width,clip-path,color | focus,invalid | cell,control,icon,preview,sweep,sweep-base,track | inputs |
| `image` | background,border-radius,color,font-size,transition | - | - | components |
| `import-map` | - | - | - | flows |
| `import-preview` | background,color,font-size | invalid | error | flows |
| `inbox` | animation,background,border-block-start,border-radius,box-shadow,color,font,font-family,font-size,gap,letter-spacing,min-block-size,min-inline-size,padding,padding-inline,text-transform | - | footer,group,header,list,new-pill,root | app |
| `input-group` | background,block-size,border,border-radius,color,font-size,padding-inline | - | addon | inputs |
| `inset` | background,border-radius,padding | - | - | layout |
| `inspector` | animation,background,border-block-end,border-block-start,border-inline-start,border-radius,box-shadow,gap,grid-template-columns,min-block-size,padding,padding-inline | open | aside,panel-body,panel-head | layout |
| `integration` | background,border,border-color,border-radius,font,padding,transition | - | logo | flows |
| `integrations` | gap | - | - | flows |
| `integrity` | background,border-radius,color,font | - | - | app |
| `item` | border-radius,box-shadow,color,font-size,gap,padding | - | description | components |
| `item-list` | box-shadow | - | - | components |
| `jsontree` | background,border,border-inline-start,border-radius,color,font,min-block-size,outline,transition | focus | - | inputs-rich |
| `kanban` | animation,animation-name,animation-range,animation-timing-function,background,background-color,block-size,border,border-color,border-radius,box-shadow,color,font,font-size,gap,inline-size,inset-block,min-block-size,opacity,outline,outline-offset,transition | disabled,focus,hover | card,column,column-head,count,head,item,label-chip,menu,move,node,placeholder | app,data,veneer |
| `kbd` | background,border,border-radius,color,font | - | - | components |
| `knob` | background,border,border-width,box-shadow,clip-path,color,font,transition | focus,invalid | arc,cell,control,icon,pointer,preview,sweep,sweep-base,track,value | inputs |
| `knob-row` | color,font,font-size,gap,letter-spacing | - | caption | inputs |
| `kv` | background,block-size,border-radius,box-shadow,color,font,font-size,gap,inset,outline,padding | focus,hover | body,remove | inputs-rich |
| `landing` | background,color | - | control,indicator | marketing |
| `layers` | color,inset,inset-inline-end,inset-inline-start,outline | focus | name,toggle | data |
| `legend` | border-radius,color,font-size,min-block-size,outline | focus,hover | - | data |
| `lightbox` | background,border-radius,font,outline-color,transition | focus | bar,stage,tool | marketing |
| `line-item` | background,border,border-block-start,border-radius,color,font-size | - | thumb | flows |
| `lines` | border-block-start,color,font-size | - | total | flows |
| `link` | background,background-size,border-radius,color,inset,text-decoration-thickness,transition | focus,hover | anchor,toggle | components |
| `linkcard` | background,border,border-color,border-radius,color,outline,transition | focus,hover | media,text | inputs-rich |
| `list` | animation-name,animation-range,animation-timing-function,background,border,border-block-start,border-radius,color,font-size,min-block-size,outline,transition | focus,hover | actions,card,content,head,item,trailing | data,veneer |
| `listbox` | background,border,border-color,border-inline-start,border-radius,box-shadow,color,font-family,font-size,font-weight,letter-spacing,padding,transition | active,focus | group-label,item-check | inputs |
| `listing` | animation,animation-name,animation-range,animation-timing-function,background,border,border-block-end,border-radius,box-shadow,color,font,font-size,font-variant-numeric,letter-spacing,outline,outline-offset,transition | focus,hover | art,card,grid,head,item,meta,name,price,pub,sweep-base,tags | marketing,veneer |
| `live-room` | animation,background,border,border-block-start,border-color,border-radius,box-shadow,color,font,font-size,font-variant-numeric,gap,padding,transition | checked | actions,bar,crumb,gates,peer-cursor,peer-ring,step,steps | marketing |
| `live-status` | background,border,border-color,border-radius,color,font,transition | - | - | components |
| `load-more` | color,font-size | - | - | data |
| `lobby` | background,border,border-radius,color,font,font-variant-numeric,gap,margin-block,padding,transition | - | countdown,phase,sweep-base | marketing |
| `locale` | - | - | - | layout |
| `lock` | background,border-radius,color | - | - | app |
| `log` | border-radius,box-shadow,font | focus | - | inputs-rich |
| `logo` | color,inset,stroke | - | anchor,toggle,kerf | components |
| `logos` | color,font-size,gap,min-block-size | - | caption,caption-row,pause | marketing |
| `map` | background,block-size,border,border-radius,box-shadow,color,fill,font,font-size,inline-size,inset,outline,stroke | active,focus | attribution,cluster,controls,marker,popup | data |
| `mark` | background,box-shadow | - | - | components |
| `markdown` | background,border,border-block-start,border-color,border-inline-start,border-radius,color,font-family,font-size,font-weight,letter-spacing,outline | checked,focus | - | inputs-rich |
| `market` | border,border-radius,color,font,font-size,font-variant-numeric,gap,letter-spacing,margin-block-end,min-block-size,padding,text-transform | - | count,empty,grid,rail,results,toolbar | marketing |
| `marquee` | border-block,color,font-family,row-gap | - | star,track,word | marketing |
| `masonry` | column-gap,gap,margin-block-end | - | - | layout |
| `master-detail` | animation,background,block-size,border-inline-end,grid-template-columns | - | detail,list | layout |
| `md-editor` | border-block-end,border-radius,box-shadow,color,font-size,gap,inset,outline | active,focus | tabs | inputs-rich |
| `menu` | background,block-size,border,border-radius,box-shadow,color,font,font-family,font-size,gap,inline-size,letter-spacing,line-height,margin,min-block-size,opacity,padding,padding-inline,padding-inline-start,scale,scroll-margin-block,text-transform,transform-origin,transition,translate | active,disabled,focus,open | chevron,content,group-label,indicator,item,separator,shortcut,shuttle | components |
| `menubar` | background,block-size,border,border-radius,color,font,inset-block | - | - | components |
| `message` | background,border-inline-start,border-inline-start-color,border-radius,box-shadow,color,font,font-size,grid-template-columns,inset-inline,outline | focus | actions,attachment,bubble,by,mention,quote,quote-by,quote-jump,status,sweep | app |
| `meta-list` | border-block-start,color,font-size | - | - | components |
| `meter` | background,block-size,border-radius,box-shadow,clip-path,color,font,font-family,font-size,stroke,transition | - | head,label-row,mark,note,over,rail,rail-fill,range,readout,tick,track | components,data,flows |
| `mock` | background,border,border-block-end,border-radius,box-shadow,color,font | - | bar | marketing |
| `model-menu` | background,border-radius,color | active,hover | - | app |
| `monthgrid` | background,border-radius,box-shadow,color,font-family,font-size,outline,transition | active,focus,hover | head | inputs-rich |
| `motion-card` | background,border,border-radius,box-shadow,color,font,font-family,font-size,gap,outline,outline-offset,padding,scale,transition,transition-duration,translate | active,focus,hover,press | body,check,name,sweep-base | marketing |
| `motion-cards` | gap | - | - | marketing |
| `nav` | background,color,gap,padding-block,transition | active,focus,hover | indicator | components |
| `navlist` | background,block-size,border-inline-start,border-radius,box-shadow,color,font,font-family,font-size,gap,inline-size,letter-spacing,margin,min-block-size,text-transform,transition | active,hover | chevron,group-label,indicator,item,trailing | layout |
| `newsletter` | block-size,color,font-size,gap | - | fine | marketing |
| `notification` | animation,background,border-radius,box-shadow,color,font-size,padding,transition | hover | kind,meta,quote,sweep-base,text,unread | app |
| `number` | color | - | - | components |
| `otp` | animation,background,block-size,border-radius,border-width,clip-path,color,font,gap,max-inline-size,transition,transition-delay | focus,invalid | cell,char,control,icon,preview,sep,sweep,sweep-base,track | flows,inputs |
| `page-header` | color,font-family,font-size,font-weight,gap,letter-spacing,line-height,max-inline-size,text-transform | - | actions,description,eyebrow,heading,meta,title | layout |
| `pager` | border,border-radius,color,font-size,gap,margin-block-start,padding | - | - | layout |
| `pagination` | background,background-color,block-size,border,border-color,border-radius,box-shadow,color,font,font-size,inset,inset-inline-end,inset-inline-start,min-inline-size,opacity,outline,padding-inline,transition | active,disabled,focus,hover | item,jump,page,summary | components,data,marketing |
| `palette` | backdrop-filter,background,border,border-block-end,border-block-start,border-radius,border-width,box-shadow,color,font,font-family,font-size,gap,inline-size,inset,letter-spacing,min-block-size,outline,padding,padding-inline,padding-inline-start,scale,scroll-margin-block,text-transform,transition,translate | active,focus,hover,open | crumb,empty,footer,group-label,hint,input,input-row,item,list,row,shortcut,sweep,sweep-base | components,veneer |
| `panel` | background,border,border-radius,box-shadow,color,font-family,font-size,font-weight,gap,letter-spacing,padding | - | card,description,header,title | data |
| `part/app-bar` | background,border-block-end,font-family,font-size,font-weight,gap,letter-spacing,padding | - | - | app |
| `part/app-title` | font-family,font-size,font-weight,letter-spacing | - | - | app |
| `part/avatar` | background,border-radius,color,font | - | - | marketing |
| `part/bars` | transition | - | - | components |
| `part/beacon` | background,box-shadow | - | - | flows |
| `part/carrier` | padding-block | - | - | inputs |
| `part/check` | accent-color,background,border-radius,color,font,min-block-size | hover | - | inputs-rich |
| `part/code` | color,font | - | - | inputs-rich |
| `part/code-label` | color,font | - | - | flows |
| `part/codes` | background,border,border-radius,color,font | - | - | flows |
| `part/confirm-field` | border-color,border-radius | - | - | components |
| `part/copy-note` | animation,background,border,border-radius,color,font | - | - | components |
| `part/countdown` | background,border-radius,color,font | - | - | app |
| `part/country` | background,border-end-start-radius,border-inline-end,border-radius,border-start-start-radius,color,font,margin-inline-start,outline,padding-inline | focus,hover | - | inputs-rich |
| `part/diagram` | background,border,border-block-end,border-radius,color,font | - | - | inputs-rich |
| `part/eyebrow` | color,font-family,font-size,font-weight,gap,letter-spacing,margin-block-end,margin-block-start,text-transform | - | - | app,data,marketing,veneer |
| `part/frame` | transition | - | - | inputs-rich |
| `part/frame-corners` | block-size,color,inline-size | - | - | veneer |
| `part/glow` | background,opacity | - | - | marketing |
| `part/hit` | background | - | - | data |
| `part/icon` | clip-path | - | - | inputs-rich |
| `part/index` | color | - | - | marketing |
| `part/indicator` | color,rotate,transition | active | - | components |
| `part/item-check` | block-size,color,inline-size | - | - | inputs |
| `part/item-hint` | color,font-size | - | - | inputs |
| `part/item-icon` | block-size,color,inline-size | - | - | inputs |
| `part/layer` | color | - | - | inputs-rich |
| `part/listbox` | background,border-radius,color,font,font-family,font-size,min-block-size,outline | active,focus,hover | - | inputs-rich |
| `part/literal` | color | - | - | inputs-rich |
| `part/live` | animation | - | - | marketing |
| `part/logo` | color,font-family | - | - | marketing |
| `part/mark` | animation | - | - | flows |
| `part/months` | animation | - | - | inputs-rich |
| `part/opt-meta` | color,font-family,font-size | - | - | inputs-rich |
| `part/org` | color,font-size | - | - | layout |
| `part/peer-cursor` | background,box-shadow,color,font,stroke | - | - | marketing |
| `part/peer-outline` | background,border-radius,box-shadow,color,font,transition | - | - | marketing |
| `part/peer-ring` | animation,border | - | - | marketing |
| `part/plane` | animation-play-state | - | - | marketing |
| `part/pop-head` | border-block-end | - | - | inputs-rich |
| `part/provider` | color,font,transition | - | - | inputs-rich |
| `part/rail` | background,block-size,box-shadow,transition | - | - | flows |
| `part/rail-fill` | background,block-size,box-shadow,clip-path,transition | checked | - | flows,veneer |
| `part/rail-hover` | background,clip-path | - | - | veneer |
| `part/range-sep` | color,padding-inline | - | - | inputs-rich |
| `part/rays` | animation-play-state,background,opacity | - | - | marketing |
| `part/row` | transition | - | - | veneer |
| `part/rule` | animation,background,block-size,margin-block-start | - | - | marketing |
| `part/scrim` | animation,backdrop-filter,background,z-index | open | - | inputs-rich |
| `part/search` | background,block-size,border,border-color,border-radius,box-shadow,color,font-size | focus | - | inputs-rich |
| `part/segment` | background,border-radius,box-shadow,color,transition | focus | - | inputs-rich |
| `part/shuttle` | background,block-size,border-radius,translate | - | - | veneer |
| `part/skeleton` | background,border-radius | - | - | data |
| `part/spacer` | transition | - | - | veneer |
| `part/spark` | fill,opacity,stroke,stroke-width | - | - | data |
| `part/spot` | background,opacity,transition | hover | - | marketing |
| `part/stars` | color | - | - | marketing |
| `part/sweep` | border,clip-path,color | invalid | - | inputs-rich,veneer |
| `part/sweep-base` | border,clip-path,color | - | - | app,inputs-rich,veneer |
| `part/sweep-content` | color | - | - | veneer |
| `part/sweep-corners` | block-size,color,inline-size | - | - | veneer |
| `part/sweep-fill` | background,color,transition | - | - | veneer |
| `part/sweep-label` | color | - | - | veneer |
| `part/sweep-outline` | background,color | - | - | veneer |
| `part/switcher` | color,font-size | - | - | layout |
| `part/sync` | color,font-size | - | - | flows |
| `part/thumb` | transition | - | - | veneer |
| `part/tilt` | transition | - | - | marketing |
| `part/tool-frame` | border-radius,color | - | - | app |
| `part/track` | clip-path | checked | - | veneer |
| `part/version` | background,border,color,font | - | - | layout |
| `part/view-toggle` | background,block-size,border,border-radius,box-shadow,color,inline-size,inset-block,outline | active,focus | - | data |
| `part/weave` | animation,animation-delay,color,stroke,stroke-width | - | - | flows,marketing |
| `pay-frame` | animation-play-state,background,block-size,border,border-radius,box-shadow,color,font-size | - | head,slot | flows |
| `person` | background,border,border-radius,color,font,font-family,font-size,min-block-size,transition | - | color,links,name,photo,role | marketing |
| `persona` | color,font-size | - | secondary | components |
| `pill` | background,border,border-color,border-radius,color,font,inset-block,text-box,transition | active,hover | count,eyebrow | components,veneer |
| `pip` | border-radius,box-shadow,transition,z-index | - | - | app |
| `plan` | animation,animation-name,animation-range,animation-timing-function,background,border,border-block-start,border-color,border-radius,box-shadow,color,font,font-family,font-size,font-variant-numeric,font-weight,gap,letter-spacing,padding,text-decoration-color,transition | focus,hover | amount,box,card,desc,features,head,header,item,name,per,queue,sweep-base | app,marketing,veneer |
| `plan-card` | background,border,border-radius,box-shadow,color,font,font-size,letter-spacing,outline,outline-offset,transition | checked,focus | price,radio,sweep-base | flows |
| `plans` | gap | - | - | flows |
| `player` | background,block-size,border,border-radius,box-shadow,color,font,font-family,font-size,gap,inline-size,min-inline-size,outline,outline-color,outline-offset,padding,scale,transition,translate | active,focus,hover,press | big-play,chip,controls,meta,play,preview,rail,scrubber,thumb,ticks,time,tool,wave | marketing |
| `player-notes` | background,border,border-color,border-radius,box-shadow,color,font,font-size,gap,margin-block-start,min-block-size,outline,outline-offset,transition | active,focus,hover | chapters,keys,readout | marketing |
| `popconfirm` | - | - | - | components |
| `popover` | animation,background,border,border-radius,box-shadow,color,font-size,gap,line-height,margin,margin-block-end,margin-block-start,padding,scale,transform-origin,transition,translate,z-index | open | content,description,handle,sheet-head,title | app,components,inputs-rich |
| `popup` | animation,background,border,border-inline-start,border-radius,box-shadow,color,font-family,font-size,font-weight,letter-spacing,padding,transition,z-index | - | chev,empty,group-label | inputs |
| `post` | animation-name,animation-range,animation-timing-function,background,border,border-block-end,border-inline-end,border-radius,box-shadow,color,font,font-family,font-size,font-weight,letter-spacing,outline,outline-offset,text-transform,transition | focus,hover | art,card,excerpt,head,item,meta,sweep-base,tag,title | marketing,veneer |
| `prefs` | border-block-start,color,font-size | - | hint | components |
| `prefs-matrix` | background,border-block-start,border-radius,border-start-end-radius,border-start-start-radius,box-shadow,color,font,font-family,font-size,gap,letter-spacing,min-block-size,outline,padding,text-transform | focus | ch-head,ch-name,corner,footer,grid,group,head,lock,na,status | app |
| `prejoin` | background,border-radius,gap | checked | layout,meter,preview,stack | app |
| `presence` | color,font-size | - | - | marketing |
| `pricing` | gap | - | period,plans | marketing |
| `product` | color,font-family,font-size,font-variant-numeric,font-weight,gap,letter-spacing | - | info,media,name,price | marketing |
| `progress` | animation,background,block-size,border-radius,clip-path,color,font,font-size,gap,stroke,stroke-width,transition | - | label-row,range,root,track,value-text | app,components,veneer |
| `prompt` | background,block-size,border-radius,color,font | hover | model | app |
| `props` | border,border-block-start,border-radius,box-shadow,color,font | focus | - | inputs-rich |
| `prose` | animation-name,animation-range,animation-timing-function,background,border,border-block-end,border-block-end-color,border-block-start,border-inline-start,border-radius,color,font,font-family,font-size,font-weight,letter-spacing,line-height,margin-block,min-block-size,min-inline-size,transition | hover | anchor,card,footnotes,head,item | inputs-rich,veneer |
| `pull-refresh` | background,border,box-shadow,color,transition | - | content,indicator | layout |
| `push-ask` | background,border-radius,box-shadow,color,padding | - | mark | app |
| `qr` | background,border,border-radius,color,fill,font,gap | - | plate,pupil,value | components |
| `qty` | background,block-size,border-radius,box-shadow,color,font,inline-size,opacity,outline | disabled,focus,hover | - | flows |
| `quantity` | background,block-size,border-radius,border-width,clip-path,color,font,inline-size,opacity,transition | disabled,focus,hover,invalid | cell,control,icon,preview,sweep,sweep-base,track | inputs |
| `query` | background,block-size,border,border-inline-start,border-radius,box-shadow,color,font,inset-inline-end | - | group,join | data |
| `question` | background,border-radius,box-shadow,color,min-block-size | checked | - | app |
| `quote` | animation-name,animation-range,animation-timing-function,background,border,border-inline-start,border-radius,box-shadow,color,font,font-family,font-size,font-style,gap,line-height,padding | - | card,head,item,source | components,marketing,veneer |
| `radio` | background,border-radius,border-width,clip-path,color,column-gap,font-size,line-height,min-block-size,opacity,scale,transition | checked,disabled,focus,invalid,press | cell,control,hint,icon,preview,sweep,sweep-base,track | components,inputs,veneer |
| `range-head` | color,font,gap,letter-spacing | - | - | inputs |
| `range-panel` | background,border,border-inline-end,border-radius,box-shadow,color,font-size,gap,min-block-size,outline,padding-inline-end | active,focus,hover | - | inputs-rich |
| `rating` | background,block-size,border,border-radius,color,fill,font-family,font-size,font-variant-numeric,gap,inline-size,outline,padding,scale,transition,transition-delay | checked,focus,press | bar,bars,input,score,summary | inputs,marketing |
| `rating-field` | color,font-size | invalid | - | marketing |
| `reactions` | background,border-radius,box-shadow,color,inset-block,inset-inline,outline | active,focus | - | app |
| `reasoning` | block-size,border-inline-start,border-inline-start-color,border-radius,color,font-size,transition | hover | body,chev,model | app |
| `receipts` | color | - | - | app |
| `relative-time` | inset | - | anchor,toggle | components |
| `results` | border-block-end,color,font-size | - | - | data |
| `review` | animation,background,border,border-block-start,border-radius,color,font,font-family,font-size,gap,inset,letter-spacing,outline,outline-offset,padding-block | focus | foot,meta,photos,title | marketing |
| `reviews` | color,font,font-size,gap,margin-block-start | - | count,header,tools | marketing |
| `ring` | font-family,font-size,stroke,transition | - | readout | data |
| `roles-matrix` | color | - | no,yes | flows |
| `room` | animation,background,border-block-end,border-radius,box-shadow,color,font,font-size,gap,margin,padding,z-index | - | header,people,rail,rec,root,share,sidebar,stage,strip | app |
| `route-progress` | background,transition,z-index | - | - | layout |
| `row` | gap | - | - | layout |
| `rte` | background,block-size,border,border-block-end,border-block-start,border-color,border-inline-start,border-radius,box-shadow,color,font,font-family,font-size,font-weight,gap,inline-size,letter-spacing,line-height,outline,padding,transition,z-index | active,focus,hover | content,frame,linkbar,sep,slash,tool | inputs-rich,veneer |
| `rules` | color,font-size,transition | - | - | inputs |
| `run` | background,border-radius,box-shadow,color,font,font-size | - | approve,detail,dot | app |
| `save-bar` | background,border-radius,box-shadow,clip-path,color,font-size,gap,transition | - | text | flows,inputs |
| `scene` | background,block-size,border,border-radius,box-shadow,color,font,transition | - | bar,cap,card,dots,knot,layer,row,thread,veneer | marketing |
| `scroll-area` | outline-offset,scroll-padding-inline | focus | - | layout |
| `scroll-grid` | background,border,border-block-end,border-inline-end,border-radius,box-shadow,color,font,font-size,letter-spacing,outline,text-transform | active,focus | cell,col-head,corner,row-head | data,veneer |
| `scroll-progress` | background,block-size,inset | - | - | marketing |
| `section` | background,border-block,border-block-start,border-radius,gap,padding,padding-block,padding-inline | - | - | layout |
| `section-message` | border-block,color,padding | - | - | components |
| `section-peers` | - | - | - | app |
| `segmented` | background,block-size,border-radius,border-width,box-shadow,clip-path,color,font,font-size,inline-size,outline,padding-inline,transition,translate | checked,focus,hover,invalid | cell,control,count,icon,indicator,item,list,preview,shuttle,sweep,sweep-base,track | inputs,veneer |
| `select` | background,block-size,border,border-color,border-radius,box-shadow,color,font,font-family,font-size,gap,inline-size,letter-spacing,line-height,margin-block-end,min-block-size,opacity,outline,padding,padding-inline,scale,scroll-margin-block,text-transform,transform-origin,transition,translate | active,disabled,focus,hover,open | content,done,empty,group-label,handle,indicator,item,item-hint,list,search,sheet-head,shuttle,trigger | components,inputs |
| `selection-bar` | background,border,border-color,border-radius,box-shadow,color,font-size,font-variant-numeric,gap,inset-block-start,margin-block-end,min-block-size,transition | active | count,hint | marketing |
| `selection-toolbar` | animation,background,border-radius,box-shadow,color,font,z-index | - | - | components |
| `separator` | background,color,font,letter-spacing,text-transform | - | - | components |
| `setting` | border-block-start,color,font-size,gap,padding-block | - | hint | inputs |
| `setting-row` | border-block-start,color,font-size,gap | - | - | flows |
| `settings` | background,block-size,border-block-end,border-radius,color,font-size,gap,inline-size,margin-inline,min-block-size,padding-inline,transition | active,hover | content,layout,nav | flows |
| `settings-section` | background,border,border-color,border-radius,color,font,font-size,padding-inline | - | group | flows |
| `share` | background,border-radius,color | - | link,person,target | app,components |
| `sheet` | animation,backdrop-filter,background,block-size,border,border-block-start,border-end-end-radius,border-end-start-radius,border-start-end-radius,border-start-start-radius,box-shadow,color,font-family,font-size,font-weight,gap,inset-block,letter-spacing,line-height,opacity,outline,padding,padding-block-end,padding-block-start,transition,translate | focus,hover | body,description,footer,handle,header,title | components,veneer |
| `shell` | animation,animation-delay,backdrop-filter,background,block-size,border,border-block-end,border-block-start,border-inline-end,border-inline-end-color,border-radius,border-start-end-radius,border-start-start-radius,box-shadow,color,font,font-family,font-size,font-weight,gap,inline-size,inset-block-start,inset-inline-end,inset-inline-start,letter-spacing,margin,margin-block-start,max-block-size,max-inline-size,min-block-size,min-inline-size,padding,padding-block-end,padding-block-start,padding-inline,text-transform,transform,transition,z-index | active,focus,hover | actions,brand,command,command-hint,command-label,dock,edge-tab,header,icon,layout,main,menu,nav,nav-count,nav-extra,nav-foot,nav-group,nav-item,nav-label,nav-toggle,page,palette,scrim,sheet,skip,switcher,title | layout,veneer |
| `shimmer` | animation,background,color | - | - | app,veneer |
| `shortcuts` | background,border-block-start,color,font,font-size,gap,letter-spacing | - | empty,groups | flows |
| `sidenav` | background,block-size,border,border-block-end,border-inline-end,border-radius,box-shadow,color,font-size,gap,inline-size,inset-block,inset-block-start,inset-inline-start,margin-block,min-block-size,outline,outline-offset,padding,padding-block-end,padding-block-start,padding-inline,transition,z-index | focus,hover,open | backdrop,bar,chevron,empty,filter,group-label,head,indicator,item,lead,panel,scroll,sections,title | layout |
| `signature` | border-block-end,color,font,font-size,transition | - | baseline,empty,typed | inputs-rich |
| `skeleton` | animation,background,border-radius,transition | - | - | components,veneer |
| `skeleton-scope` | animation,background,border-radius,opacity | - | - | components |
| `slider` | background,block-size,border,border-radius,box-shadow,color,font,inset,opacity,transition | disabled,focus | bubble,range,thumb,ticks,track | inputs |
| `snippet` | background,border,border-radius,color,font | - | - | inputs-rich |
| `sortable` | background,block-size,border,border-color,border-radius,box-shadow,color,font,font-size,gap,inline-size,inset,min-block-size,outline,transition | active,floated,focus,hover | handle,item,moves,pos,rank,text | data,inputs-rich,veneer |
| `sources` | background,border-radius,color,font | - | - | app |
| `spacer` | - | - | - | layout |
| `speech` | background,border-radius,color,font,font-size,min-block-size | - | interim,level,mic,strip,time,transcript,wave | app |
| `speed-dial` | background,border,border-radius,box-shadow,color,font-size,transition,transition-delay,translate | open | action,action-label | components |
| `spinner` | animation | - | - | components,veneer |
| `split` | gap,inset-block-start | - | - | layout |
| `split-pane` | background,border,border-radius,inline-size,inset-inline-start,transition | focus,hover | separator | layout |
| `sso` | gap | - | - | flows |
| `stack` | background,border-block-start,border-color,border-inline-start,border-radius,color,font,gap,padding-block-start | - | error | inputs-rich,layout |
| `stage` | animation,background,border,border-radius,caret-color,color,padding,transition | active | - | canvas |
| `stat` | animation,animation-name,animation-range,animation-timing-function,background,background-color,border,border-radius,color,font-family,font-size,font-weight,letter-spacing,opacity,outline,outline-offset,padding | focus,hover | caption,card,head,item,node,number,spark,value | data,veneer |
| `stat-row` | background,border-block-start,border-inline-start,border-radius,color,font,font-family,font-size,gap,letter-spacing,text-transform | - | - | data |
| `stat-strip` | border-block,border-block-start,border-inline-start,color,font,font-size,font-variant-numeric,letter-spacing,margin | - | - | marketing |
| `stats` | background,border,border-block,border-inline-start,border-radius,color,font-family,font-size,font-variant-numeric,font-weight,letter-spacing,padding | - | label,stat,value | marketing |
| `status-bar` | background,border-block-start,color,font,min-block-size,padding-block-end,padding-inline | hover | close | layout,veneer |
| `status-dot` | animation,background,box-shadow | - | - | app,components |
| `status-light` | font-size | - | - | components |
| `steps` | background,block-size,border,border-color,border-radius,box-shadow,color,font,font-size,gap,margin-block-start,transition | active | compact,description,indicator,item,title | components,inputs |
| `sticky-bar` | animation,backdrop-filter,background,border,border-block-end,border-block-start,box-shadow,color,gap,inset-block-end,margin-block-end,max-inline-size,padding,z-index | - | - | layout |
| `stopwatch` | font | - | value | components |
| `story` | background,border,border-radius,box-shadow,color,font,font-family,font-size,font-weight,gap,inline-size,scale,transition | - | frame,rail,screen,step,steps | marketing |
| `strength` | background,color,font,font-size,letter-spacing,transition | - | - | inputs |
| `suggest` | animation,background,border-radius,box-shadow,color,font,font-size,z-index | active | cmd,group | app |
| `suggestions` | background,border-radius,color,min-block-size,outline | focus | - | app |
| `surface` | animation-name,animation-range,animation-timing-function,background,border,border-radius,box-shadow,color,font-family,font-size,font-weight,gap,letter-spacing,line-height,padding,scale,text-transform,transition,transition-duration | focus,hover,press | card,content,eyebrow,head,item,panel,title,value | components,layout,veneer |
| `swatches` | border-radius,box-shadow | checked | - | components |
| `switch` | background,border-radius,border-width,clip-path,color,column-gap,font-size,line-height,min-block-size,opacity,scale | checked,disabled,focus,invalid,press | cell,control,hint,icon,preview,sweep,sweep-base,thumb,track | components,inputs,veneer |
| `sync` | color | - | - | app |
| `synced-form` | background,border-radius,box-shadow,color,font,transition | - | control,peer-tag | app |
| `system-page` | animation,animation-delay,background,border-radius,box-shadow,color,fill,font,font-size,letter-spacing,min-block-size,padding,stroke,stroke-width,text-transform | focus,hover | accounts,art,code,keyhole,lock,meta,pending,shackle,weave | app,flows |
| `table` | animation,animation-delay,animation-name,animation-range,animation-timing-function,background,block-size,border,border-block-end,border-block-end-color,border-block-start,border-color,border-end-end-radius,border-end-start-radius,border-inline-start,border-radius,border-start-end-radius,border-start-start-radius,box-shadow,color,font,font-family,font-size,gap,inline-size,inset,inset-block-start,inset-inline-end,inset-inline-start,letter-spacing,margin-inline-start,max-block-size,min-block-size,min-inline-size,opacity,outline,padding,padding-block,stroke,text-transform,transition | active,focus,hover,invalid | aggregate,bulk,card,control,count,detail,editor,expand,filters,footer,group,head,item,loading,mono,resize,secondary,select,sheet,skeleton,slide,sort,sort-icon,sortbar,state,toggle,toolbar,tree-cell,tree-label,viewport | data,veneer |
| `tabnav` | background,block-size,border-block-end,border-radius,color,gap,inline-size,inset-inline,padding-inline,transition | active,hover | - | layout |
| `tabs` | animation,background,block-size,border,border-color,border-radius,box-shadow,color,font,gap,inline-size,padding,padding-inline,transition,translate | active,focus,hover | content,indicator,list,root,shuttle,trigger | app,components,veneer |
| `tag` | animation,background,border,border-radius,box-shadow,color,font-size,inset,text-box | hover | eyebrow,remove | components,inputs,veneer |
| `team` | gap | - | - | marketing |
| `tests` | background,border,border-radius,color,font,font-size,min-block-size | - | summary | inputs-rich |
| `text` | color,font-family,font-size,font-weight,letter-spacing,line-height,text-transform | - | - | shim-type,type |
| `thread` | background,border-block-start,border-color,color,font,padding | - | divider,log,root | app |
| `thread-replies` | color,min-block-size | - | - | app |
| `thumbs` | background,border,border-color,border-radius,box-shadow,gap | active | - | marketing |
| `ticker` | transition | - | digit | components |
| `tile` | animation,animation-name,animation-range,animation-timing-function,backdrop-filter,background,border,border-radius,box-shadow,clip-path,color,font,font-family,font-size,font-weight,gap,letter-spacing,padding,transition | focus,hover | art,body,card,flag,head,icon,item,level,name,sweep-base | app,marketing,veneer |
| `timeline` | animation,animation-name,animation-range,animation-timing-function,background,border,border-radius,box-shadow,color,font,font-size | - | card,detail,head,item,knot,when | data,veneer |
| `toast` | background,border,border-radius,box-shadow,color,font-size,gap,inset-block,inset-block-end,inset-inline,inset-inline-end,line-height,padding,transition,translate,z-index | - | description,icon,progress,region,root | app,components,veneer |
| `toggle` | background,block-size,border,border-color,border-radius,box-shadow,color,font,font-size,gap,inline-size,inset-block,inset-inline,inset-inline-end,inset-inline-start,min-block-size,min-inline-size,opacity,padding-inline,scale,transition,transition-duration | active,checked,hover,press | close | components,veneer |
| `toggle-group` | background,block-size,border,border-color,border-radius,box-shadow,color,inset-block,inset-inline,inset-inline-end,inset-inline-start,min-inline-size,transition | active,checked | indicator | components |
| `toggletip` | border-radius,color,inset | hover,open | trigger | components |
| `tool-call` | animation,background,block-size,border-block-start,border-radius,box-shadow,color,font,font-size,min-block-size,outline,transition | focus | approve,arg,chev,dur,io,name | app |
| `toolbar` | background,border,border-radius | - | separator | components |
| `tooltip` | background,border,border-radius,box-shadow,color,font,font-size,scale,transform-origin,transition,translate,z-index | open | chart-tip,content | components,data |
| `topbar` | backdrop-filter,background,block-size,border-block-end,border-radius,color,font-family,font-weight,gap,margin,padding-inline,z-index | hover | actions,brand,links | marketing |
| `topnav` | animation,backdrop-filter,background,block-size,border-block-end,border-radius,box-shadow,color,font-size,gap,min-block-size,padding,transition,z-index | active,hover | actions,link,mega,menu | layout |
| `tour` | animation,background,border,border-radius,box-shadow,color,font,font-size,letter-spacing,transition | checked | card,count,pips,spotlight,step-count | components,flows,veneer |
| `trace` | background,color,font | - | - | app |
| `tracker` | background,block-size,box-shadow,color,font-size,outline,transition | active,checked,focus,hover | bars,rail,rail-fill,stop | data,flows |
| `transcript` | background,border-block-start,border-radius,color,font,font-size,margin-block-start,min-block-size,outline,padding-block-start | active,focus,hover | - | marketing |
| `transfer` | color,font,gap,letter-spacing | - | moves,pane,pane-head | inputs |
| `transport` | background,border-block-start,border-radius,box-shadow,color,font,font-size,gap,opacity,outline,padding,transition | disabled,focus | bars,choices,config,figures,head,label,lane,lane-name,lanes,log,note,row | app |
| `tree` | background,border,border-color,border-inline-start,border-radius,box-shadow,color,font,font-size,min-block-size,outline,transition | active,checked,focus,hover | box,row,twisty | data,inputs |
| `truncate` | color,font-family,font-size,inset,outline | focus | anchor,toggle | components |
| `typing` | animation,color,padding-inline | - | dots | app |
| `uploads` | animation,background,border,border-block-start,border-color,border-radius,color,font,font-size,gap,transition | - | meta,progress,state,thumb | inputs |
| `usage` | - | - | - | flows |
| `variant` | background,block-size,border,border-color,border-radius,box-shadow,color,font-size,gap,inline-size,margin-block-end,outline,outline-color,outline-offset,transition | checked,disabled,focus | options,size,swatch | marketing |
| `velocity` | border-block,color,font,font-style | - | row | marketing |
| `versions` | background,border-radius,box-shadow,color | active,hover | - | app |
| `viewport-rail` | background,border-radius,box-shadow,transition | - | - | app |
| `virtual` | background,border,border-block-end,border-radius,color,font-family,font-size | - | row | data |
| `waitlist` | background,block-size,border,border-radius,color,font,font-size,font-variant-numeric,gap,letter-spacing,padding | - | place,proof,share | marketing |
| `wall` | animation-play-state,column-gap,font-size,gap,margin-block-end,padding | - | col,columns,foot,tracks | marketing |
| `watermark` | opacity | - | - | components |
| `wheels` | background,border-block,border-radius,color,gap,outline | active,focus | - | inputs-rich |
| `xy-pad` | background,border,border-radius,border-width,box-shadow,clip-path,color,inset,outline | focus,invalid | cell,control,cross,icon,preview,sweep,sweep-base,thumb,track | inputs |
| `year` | background,block-size,border-radius,box-shadow,color,font,font-family,font-size,font-weight,gap,letter-spacing,min-block-size,outline,transition | active,focus,hover | detail,dots,legend,month-title,months,num,title,toolbar,year-month | app |
| `zoom` | background,border,border-radius,transition | - | - | marketing |

The root/role records are `root` (foundations token declarations and root/type paints),
`text/display`, `text/title`, `text/heading`, `text/body`, `text/prose`, `text/label`,
`text/eyebrow`, `text/caption`, `text/code`, `text/control`, and `text/button`, where each role
expands only its actual `--veneer-text-<role>-*` consumers. Bare anchors bind the `link` record.
The space-intent selectors (`data-gap`, `data-pad`) bind the system scale, not a new component.

<!-- veneer-theme-schema:end -->

## Merge and scope rules

Normalize legacy seed forms to optional `accent` and `neutral` before merging. Do not fill an
omitted accent with the default until after the merge. The base theme is the app's system, seed,
colours, parts and tokens. A named theme deep-merges that base: colour/token dictionaries by
key, seeds by accent/neutral, system by scale/key, and parts by property within each state. Leaf
values replace; arrays and null are errors. There is no theme-to-theme inheritance. Resolve
aliases after the merge so an inherited `parts.button.bg: 'brand'` follows a theme's replacement
of `colors.brand`.

The precedence for each effective theme is canonical defaults, legacy radius/fonts conveniences,
system, seed-derived colour values (including fitting), parts, then raw `tokens`. Known raw part
tokens normalize into the same private configured slots as high-level parts, and win there; they
are not assigned to noninheriting public slots on the palette root. Non-colour system inputs
inherit and rederive through the same boundary mechanism as colours. A nested density/expression
stop cannot erase them. Explicit per-element tone colours beat inherited part settings for that
component; an inline part token on that element or ordinary author CSS can override them.
Preserve existing semantic tones and emphasis when there is no explicit theme setting.

Use **`data-palette`** for a named theme. Keep `data-theme` exclusively for light/dark. The
implicit palette is `default`, meaning the base theme. `data-palette="default"` explicitly
resets a nested palette to that base. `dials.palette` selects the default through CSS when no
attribute is set. An explicit root or subtree attribute wins over that config default.

Each palette root installs a complete effective set, not only its differences from the base. The
public local part slots are distinct from these inherited configuration slots. For the union of
configured private system/part/raw override input slots, emit a value or CSS `initial` at every
palette boundary. The latter makes the custom property invalid so its `var()` fallback runs.
Otherwise an omitted sunset setting would leak an ocean setting from an ancestor.

System token expressions must re-evaluate at `[data-palette]` and every existing dial scope.
Generated themed CSS adds those roots to the existing derivation selectors. Seed and override
inputs inherit; a density/expression/theme scope inside a palette recomputes using those inputs.
The config default's resolved semantic page/text/accent values also feed generated share cards;
part-only settings do not recolour a card. Existing legacy-only card defaults stay unchanged.
For system-token overrides, use inherited private input slots, such as
`--veneer-config-color-page`, and read them at each system declaration with the original
expression as fallback. Assign the private inputs at palette roots, then rebind the public
tokens at dial roots. Merely assigning `--veneer-color-page` at an outer palette root loses to a
nested dial's declaration. Apply the same rule to radius/fonts and legacy raw overrides in the
themed path. Do not emit fallback aliases that eagerly resolve component-local `--_fill` or
`currentColor`.

Inheritance follows DOM ancestry, including a scope placed on the component itself. A portal
outside that ancestry needs a palette attribute on its existing portal root; this API does not
change reparenting or overlay placement. Unknown hand-written palette attributes use the base
palette and reset configured slots; plugin defaults and runtime calls reject unknown names. Test
both palette-inside-dial and dial-inside-palette, nested different palettes, a base reset, and
palette/theme attributes on the same element. No descendant selector may leak across an inner
palette boundary.

## Byte-identical output without configuration

Adding `var(--veneer-button-bg, old)` to shipped CSS changes its bytes even when it paints
identically. Keep two generated variants, selected through the existing token alias facility:

1. Author valid, tokenized CSS in the canonical `docs/design/veneer/tokens` sources. At each paint
   site wrap the exact old expression, without changing its interior text. For example,
   `var(--veneer-button-bg, var(--veneer-config-part-button-bg,
   var(--veneer-tone-fill, var(--_fill))))` wraps the existing fallback. The example is one
   declaration; its original interior whitespace is retained from its source span.
   Public local part tokens use the registration/private-input scheme below; original fallback
   expressions stay at the host. Legacy output includes no new registrations.
   Non-colour renderers record both an original byte span and its configured expression. For
   motion reduction and hit-target floors, gate the supplied value through the existing safety
   formula; do not gate the already-gated default twice. Lower the entire generated expression
   back to its recorded source span, not a guessed/minified equivalent.
2. Add one lexical helper, `packages/veneer-core/scripts/theme-css.mjs`, used by generation and
   compatibility verification. It recognizes balanced `var()` calls for the explicit new token
   schema, including public local slots and their private configuration fallbacks for every
   value family, and unwraps them to the original fallback for the legacy variant. Retain each
   fallback byte,
   comment, selector, whitespace and rule order. Reject missing fallbacks. Do not use a global
   regex or strip any existing `--veneer-*` variable (especially `--veneer-sweep-fill`).
3. Run the existing splitter on that lowered legacy source. Existing `styles/` paths and
   `manifest.json` must match the pre-tokenization bytes. Generate part-aware counterparts under
   `styles/themed/` for changed files, including the scope derivation changes, non-colour inputs and local registrations.
   Preserve old query text in the legacy branch; build-time breakpoint replacements exist only
   in configured variants. Non-colour optional insertion spans lower to zero bytes. Keep the split
   ownership, selective choice/text sheets, layers and forced-colour tails identical. Include
   those new artifacts in `build()` and `--check`, so their staleness also fails the package test.
4. For nonempty `system`, `colors`, `parts`, or `themes`, or raw use of a new part token, `veneer()` contributes
   aliases from each changed `@kerf/veneer-core/styles/<path>` to its themed counterpart. Alias
   `@kerf/veneer/links.css` to its packaged themed counterpart too. Give the existing bare-link
   import in `styles.ts` that stable package id and add its export in veneer's `package.json`;
   today's alias resolver matches raw import strings, so an absolute alias key cannot intercept
   `./links.css`. Cover the real import chain in an ordinary build fixture. Leave unchanged CSS
   imports alone. The default plugin contributes no aliases and no new CSS. Empty dictionaries
   are equivalent to absence. Legacy-only seed/fields/dials/radius/fonts/tokens retain their
   existing path unless a new part token is present. The plugin's read permissions must include
   its own packaged CSS as well as veneer-core when inspecting these artifacts.
5. Named palette declarations and tone selectors are config-dependent CSS in `kerf:tokens/veneer`.
   They supply inputs to the aliased rules; they do not duplicate entire component rules in a
   higher layer. Shared palette defaults belong after `veneer.tokens` in the existing `veneer.base`
   layer, while component-local tone channels keep their component layer. Author/Tailwind
   precedence therefore remains intact, and original forced-colour rules still win.

There is one editable source, not a maintained copy of the old styles. Package both variants
through the existing `styles/*` export. A framework-free consumer that wants part tokens without
the plugin explicitly imports the corresponding `styles/themed/` sheets. This opt-in is
necessary to meet the byte contract; default imports cannot gain working token reads without
changing bytes. For the three veneer shim sheets (`links.css`, `type.css`, `layout.css`), keep
their existing legacy sources unchanged. Generate their themed counterparts by applying schema
binding spans to those inputs. Give all three stable package CSS exports/import ids; the alias
resolver matches raw import strings and cannot safely use a global `./type.css` alias. No
hand-maintained second source or generated banner is added to a default shim. All new CSS,
registrations and query branches are absent from a no-config emitted bundle.

Do not claim byte compatibility from a screenshot, equal Brotli sizes, or the plugin's empty
contribution alone. Compare the old public files and the final emitted ordinary-consumer CSS.
Record the baseline ref before implementation; update it only for an independently accepted
source change, with the reason in the integration report. Do not regenerate expected output from
the candidate being checked.

## Units, names and raw CSS

Resolve each value by its declared domain, never by its shape alone. Numbers are finite; lengths
become px, time becomes ms, angle becomes deg, and weights/line-height/scale/opacity/counts stay
unitless. Reject negative padding/radius/width/height/duration/blur, opacity outside [0,1],
nonpositive line height, weight outside [1,1000], and fractional counts. Negative margin,
position, tracking and angles are valid. Preserve `0`, `none`, `normal` and `auto` only where
that CSS property's grammar permits them. A font-size length accepts rem/em/clamp, not a
unitless string other than CSS zero. List-valued padding/margin/radius accept CSS 1-4-value
syntax; gap accepts 1-2. The resolver expands shorthands to normalized leaves before merging
state objects. Do not append px to `font.weight: 600`, `press.scale: 0.98`, or `duration: 400`.

An unadorned identifier first resolves in its domain's scale: radius `pill`, shadow `lg`, gap
`group`, font `body`, easing `out`, colour `brand`. Native keywords belong to the grammar first;
reserve them against scale-name collisions. Numeric dictionary key `2` is selected by the string
`'2'`; number 2 means 2px for a length. Unknown bare identifiers are path errors, not unchecked
CSS. A font-family string such as `Inter` is the intentional exception: an unknown family is a
literal family name and receives the existing fallback stack; quoted/comma stacks stay stacks.
Names are case-sensitive, literals keep their CSS case rules. A name can reference only its own
scale. Alias chains resolve after the theme merge with cycle/path errors, just like colours.

Raw CSS values are parsed as one declaration of the target native property using the installed
CSS parser in strict mode, without recovery or reparsing/minifying default fallbacks. Allow
valid typed lengths (`px`, `rem`, `em`, `%`, `ch`, viewport/container units),
calc/min/max/clamp, registered veneer var references and colour/easing/shadow/gradient syntax that
the relevant domain can evaluate. Reject declaration injection, unmatched
comments/quotes/brackets, controls, `!important`, at-rules, URLs, `expression()`, unknown
functions and prototype-bearing objects. Keep strings out of selectors and property names;
construct those only from the schema. A raw `var()` reference must resolve from canonical/config
scale inputs and have no cycle. If a colour pair or a constrained numeric bound cannot be
resolved, fail with its path instead of silently skipping validation. Browser `style` remains
author CSS, outside config validation.

Breakpoints are an explicit compile-time exception. Canonical viewport foundations use 600/1024
px while layout containers use 600/1000 px; calendar, availability, marketing and other
consumers have their own thresholds. Table keys retain source family, container name, comparison
and original threshold. Values are positive px lengths, ordered within each responsive family.
CSS custom properties cannot be substituted into media/container query conditions. Rewrite the
recorded queries at build time; for named themes compile their queries inside palette-bounded
`@scope` rules, including the scope root and stopping at inner palette boundaries. Test actual
query-container ancestry and generated selector constraints. A DOM `data-palette` switch selects
those precompiled branches. Arbitrary inline breakpoint variables are not supported; per-element
responsive overrides use authored CSS/classes. Do not add ResizeObserver listeners or claim a
runtime `var()` breakpoint API. Empty config retains every original query byte.

## Per-element and nested overrides

For each documented part property, emit a noninheriting public custom property in the themed
variant (`@property` with universal syntax, inherits false, no initial value). The private theme
input `--veneer-config-part-<id>-<property>[-state]` inherits separately. A consumer reads its
local public value, then its inherited private theme input, then its exact source fallback. This
keeps `style={{ '--veneer-button-radius': '12px' }}` local to that button while a palette's button
radius still reaches every button. Pass host settings to its existing sweep/label parts through
private host channels; stop at nested component roots. A subpart's own public property is local
to that subpart. Test registration/inheritance in every supported browser; no silent inheriting
fallback can claim one-element isolation. Only imported part variants carry their registrations.

The local property/state spelling follows the table (`--veneer-button-scale-press`,
`--veneer-button-padding-inline`, `--veneer-field--label-font-size`). Numeric values in CSS need
native units, for example 12px, 400ms; config's number convenience does not apply to inline CSS.
Ordinary `class` and `style` keep their priority and semantics. A custom property set on a
non-consuming ancestor does not act as a theme provider; use a palette attribute or inherited
system input (`--veneer-space-related` together with `data-veneer`) for a subtree. Direct system
inputs and nested `data-veneer` roots are preserved when selecting a named palette; more-local
authored inputs beat inherited configuration. Theme/reset roots install their full merged system
inputs, not a sparse patch that can leak another palette's radius, font, spacing, duration or
shadow.

The generation record for a shorthand stores its parsed subfields and original source span. A
configured `padding: '10px 18px'` expands block/inline channels. `font.weight` binds a real
longhand, the weight component of a source font shorthand, or the original inherited weight. Do
not replace a whole font with a weight, or put a two-value padding string into one length. New
bindings inserted to support a shorthand carry explicit original cascade fallbacks; if that
cannot be shown equivalent for an emphasis/state, do not guess an initial value. Bind that
variant explicitly. Legacy lowering removes the inserted span entirely. Themed no-override
fixtures must compare computed values too, so opting in to colours alone cannot change padding.

## Contrast: D010

Keep the current thresholds: 4.5:1 for text, 3:1 for control boundaries, indicators and focus,
including sweep versus resting base as well as surrounding surfaces. Keep current compositing
and gamut mapping. Disabled colours retain their existing contrast policy and opacity; do not
lower a threshold for enabled text to accommodate a theme.

Resolve system typography, borders, shadows and state backgrounds before enumerating D010 pairs.
Keep text at 4.5:1 even if a theme makes it large; do not relax the existing threshold. Shadow
colour used as a focus/control indicator is checked at 3:1; decorative depth alone has no text
pair. A shape/space/motion override cannot bypass forced-colour or reduced-motion protections.

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
D010 themes.ocean.parts.button.hover.text:
  ocean/dark/balanced button hover solid
--veneer-button-text-hover on --veneer-button-bg-hover
  is 2.10:1, needs 4.5:1
```

Do not silently alter an explicit part or raw-token colour to fix D010. The roadmap config is
API syntax, not an exemption: its pinned `ink` label or sweep text may fail in dark mode. The
live editor shows that failure and offers a valid adaptive family rather than claiming a pass.
The no-config branch keeps the canonical contrast tests and their expectations untouched.

## Runtime palettes and tones

Add `palette` to the dial API. `setDial('palette', 'ocean', { persist: true })` synchronously
sets `data-palette="ocean"` before it returns; all theme CSS is already loaded. Keep the
transition callback's write-once contract and the existing event shape. Add `?palette=` to
`dialsFromUrl`. `auto` removes the attribute and restores inheritance/config default; `default`
explicitly selects the base. Persistence keeps explicit `default` and removes `auto`, as with
the existing dials.

Keep existing dial unions narrow; only `DialValue<'palette'>` admits dynamic strings. Emit safe
root metadata `--veneer-palette-names` (the space-separated names including `default`) and
`--veneer-palette-default` in the themed config CSS. Emit `--veneer-palette-current` at the default
root and every palette/theme-tone boundary, including the unknown-name base reset. These values
are unquoted identifiers with the validated grammar. The palette setter validates against that
metadata after styles load; absent metadata allows only `default`/`auto`. Unknown values throw
RangeError before attributes, events, history or storage change. No new registry, listener,
network request or per-component reactive owner is needed. `getDial('palette', root)` reads the
effective palette marker from CSS, so an inherited/default palette is reported correctly; other
`getDial` semantics stay unchanged.

Root persistence continues using `veneer:dials.palette`. A subtree call changes only that subtree;
for the new palette dial, `persist: true` or `url: true` on a non-document root throws before
changing anything, because there is no stable subtree identity in the current storage or query
format. No new storage key or selector serialization is introduced.

Keep `dialScript`'s string export and support old stored dials. Whitelist recognized dial keys
and values; for palette accept only `auto` or a syntactically valid name. The head script cannot
read configured CSS metadata before styles load. A stale saved name is therefore restored but
the CSS unknown-palette rule resolves it to the base without a flash; after load the dial API
reports that effective base. Malformed JSON and blocked storage remain harmless. The app must
place `dialScript` in its blocking head before first paint, as today; without it, persistence
cannot promise a flash-free first paint. An explicit URL choice applied afterward wins.

Keep the six semantic `Tone` values for unrelated components. Add a documented `ThemeTone` for
Button, Badge, the new Pill/PillLink, Link and Nav; these accept semantic tones, configured
colour names or configured theme names and continue emitting `data-tone`. Do not widen every
shared `Tone` consumer. Generated selectors supply named-colour tone channels:
solid/hover/on-solid, soft/text/border, plus relevant sweep and indicator colours. A hex tone
derives its family as a seed; pinning an exact per-part colour uses `parts` instead. This
distinction is documented.

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
Per-app literal unions for dynamic theme/tone names are not required. Generated finite
configuration part/property/state types from this decision are required.

## Tailwind

Keep `@kerf/veneer/tailwind.css` and its existing tokens unchanged for default consumers. When
system/themes/colours are enabled, alias that entry to a generated Tailwind entry containing the
current `@theme inline` block plus `--color-<name>: var(--veneer-named-<name>)` for each
configured colour. Use a packaged template and a deterministic build-generated file selected by
token aliases. Add optional `tokens.cssEntries: Record<string, string>` to `Contributions` in
`packages/core/src/plugin.d.ts`. The writer in `packages/cli/src/plugins.mjs` emits each entry
as `.kerf/tokens/<namespace>.<entry>.css`, with the same generated header and stale-file cleanup
as the primary CSS. Entry names match `[a-z][a-z0-9-]*`; reject separators and invalid types
before writing. The veneer contribution supplies `{ tailwind: generatedCss }` and aliases
`@kerf/veneer/tailwind.css` to the absolute app-root path `.kerf/tokens/veneer.tailwind.css`,
using the contribution's existing `env.root`. The alias resolver in
`packages/core/vite/config-plugins.mjs` already resolves that file through `this.resolve`. Do
not alias to `kerf:tokens/veneer.tailwind`: `skipSelf: true` would skip the same resolver that
handles that virtual id. No resolver behaviour change or write to `node_modules` is needed. Keep
the type/writer extension separate from compiler/runtime work. Do not put `@theme` directives in
the ordinary runtime stylesheet: builds without Tailwind must remain valid.

The generated entry also maps configured space to `--spacing-<name>`, radius to
`--radius-<name>`, font to `--font-<name>`, shadow to `--shadow-<name>`, and text roles to
`--text-<role>` with line-height metadata. Resolve aliases to their canonical system tokens. For
example the roadmap's space key 2 enables `gap-2`, and radius card enables `rounded-card`.
Deduplicate existing entry names, replacing their mapped value only when configured. Keep
Tailwind default scale names usable; never emit competing definitions in different orders.

`bg-brand` and `text-brand/80` read the nearest palette's named value. Theme replacement of
`colors.brand` changes utilities along with parts; opacity modifiers are Tailwind's normal
colour mixing. Part settings do not rename utilities or change named colours. Utilities retain
their existing layer priority over component defaults. A raw `bg-[#…]` still follows existing
diagnostics. Arbitrary combinations of user utilities are outside config D010; do not claim
automatic contrast validation for every possible utility pairing. The documented editor and
examples use checked pairs. Test this with the actual Tailwind processor, not only a string
containing `@theme`.

## Follow-up ownership

Dispatch these owners in dependency order. They have disjoint source/generated paths. The
manager owns integration receipts and the shared all-stack comparison outputs. A worker does not
edit another owner's schema/types/docs output to make its own tests pass.

| owner | exclusive files and deliverable |
| --- | --- |
| Schema/types/reference | This `docs/decisions/theming.md`; new `packages/veneer-core/scripts/theme-schema.mjs`, new `packages/veneer-core/theme.schema.json`, `packages/veneer-core/package.json` for schema packaging; new `packages/veneer/plugin.template.d.mts`, generated `packages/veneer/plugin.d.mts`; new generated `packages/cli/docs/theme-tokens.md`; new `packages/veneer-core/test/theme-schema.test.ts` and new `packages/veneer/test/theme-types.test.ts` and `test/theme-types.tsconfig.json`. Own all table expansion, exact binding classification, source coverage counts, type/doc drift checks, and public config types. Other owners read the schema. |
| CSS/build | All ten existing `docs/design/veneer/tokens/*.css` files in the inventory; `packages/veneer-core/scripts/split-css.mjs`, new `scripts/theme-css.mjs`, generated `packages/veneer-core/styles/**`; `packages/veneer/src/styles.ts`, `src/links.css`, `src/type.css`, `src/layout.css` as shim inputs, new generated `src/links-themed.css`, `src/type-themed.css`, `src/layout-themed.css`; `packages/veneer/package.json` for stable shim exports; `packages/veneer-core/test/styles.test.ts`, new `test/theme-css.test.ts`, new `scripts/theme-compat.mjs`. Own all-family/scale lowering, shorthand bindings, local registrations and breakpoint branches. Do not change schema output; request a table correction from its owner if a real consumer is missing. |
| Config/resolution | `packages/veneer/plugin.mjs`, `src/plugin/dtcg.mjs`, new `src/plugin/themes.mjs`; `packages/veneer/test/plugin.test.ts`, new `test/themes.test.ts`. Own `system`/parts/theme merge, typed domain resolution and validation, metadata, aliases, head-script text, D010 subprocess input, default cards and new-theme DTCG contexts. Consume generated types; do not edit `plugin.d.mts`. Legacy DTCG output stays unchanged without new config. |
| Contrast | `packages/veneer-core/scripts/contrast-check.mjs`, `scripts/contrast-check-colors.mjs`, matching canonical `docs/design/veneer/scripts/contrast-check.mjs` and `contrast-check-colors.mjs`, new `packages/veneer-core/test/theme-contrast.test.ts`. Own all effective-state pairs and failures. The existing style test requires canonical and packaged checker files to stay identical; update those copies together, preserving thresholds. |
| Runtime | `packages/veneer-core/src/dial.ts`, new `test/palette.test.ts`, new `packages/veneer/test/palette.browser.test.tsx`. Own sync switches, URL/storage atomicity, nested system/theme overrides, element isolation and first-paint browser fixtures. Config owner alone edits `dialScript` text in plugin.mjs. |
| Components | `packages/veneer/src/Button.tsx`, `Badge.tsx`, `Type.tsx`, `Nav.tsx`, new `Pill.tsx`, new `theme-tone.ts`, `src/index.ts`; new `packages/veneer/test/theme-tone.test.tsx`. Own only the five requested tone surfaces and Pill/PillLink over existing pill CSS. Do not widen unrelated semantic Tone users or alter existing anatomy/interactions. |
| Tailwind/token writer | `packages/veneer/tailwind.css`, new `tailwind.template.css`, new `src/plugin/tailwind.mjs`; `packages/core/src/plugin.d.ts`, `packages/cli/src/plugins.mjs`, `packages/cli/test/plugins.test.ts`; new `packages/veneer/test/tailwind-theme.test.ts`, new `test/e2e/theme-entry.mjs` and new `test/e2e/theme-entry/` fixtures. Own extra generated CSS entries, strict entry-name tests, actual CSS alias/Tailwind processing and scale utilities. The existing Vite alias resolver needs no source change. Config owner calls the helper after this lands. |
| T09: CLI/learn/agent docs | `packages/cli/docs/theme.md`, `packages/cli/docs/design.md`, `site/content/learn/theming.md`, generated `site/public/llms.txt` and `site/public/llms-full.txt`. Document system/colors/parts/themes/tone/local overrides, link/include the generated full table, add the short theme-your-app learn step, and regenerate agent docs through the existing generator. The full agent text must include the new API/table content, not stale descriptions. No edits to the schema owner's generated `theme-tokens.md`. |
| T10: Theming editor | `site/src/toolkit/Theming.tsx`, `site/src/toolkit/docs/theming.ts`, `site/src/toolkit/docs/index.ts`, `site/src/routes/toolkit/[slug].tsx`, `site/src/styles/toolkit.css`. Own the live all-family part/state editor, checked preview retention, light/dark and copyable config. Preserve other pages. |
| T11: Component-page coverage | `site/src/components/ComponentPage.tsx`, new `site/src/components/ThemingTable.tsx`, per-component entries under `site/src/toolkit/**` excluding the five T10 paths, new `site/scripts/theme-pages.mjs`, new `site/test/theme-pages.test.mjs`. Generate a Theming section next to PropsTable from the shared schema: part/property/state/default/config key/custom property. Components with no themeable parts say so. Check every component page against its schema records; missing, extra or stale rows fail. Serialize toolkit edits after T10 as its ticket requires. |
| T12: Preview controls | `site/src/components/Playground.tsx`, `site/src/components/FrameTools.tsx`, `site/src/components/ExampleFrame.tsx`, new `site/src/components/ThemeControls.tsx`, new `site/test/theme-controls.test.tsx`. Add theme knobs beside prop knobs, the named-theme picker and live preview; printed output reproduces JSX plus veneer config or local overrides. Add the palette switch beside existing frame controls. Preserve their placement, values and interactions. |

Schema lands first; config/build follow its generated contract; Tailwind's writer/type extension
lands before config emits secondary entries. Runtime/components follow metadata and style rules.
Site work consumes the checked resolver and generated docs; it retains the last valid preview
when an edit fails. T11 consumes that same schema; T12 uses the resolver and palette dial rather
than a second theme model. The manager owns the sole `site/scripts/content.mjs` integration hook
that calls the T11 coverage check during site generation, keeping it outside parallel ownership.
No implementation ticket may treat a blank table row as permission to invent a token or expose
measured geometry. Finish the schema classification first.

## Verification contract

T01 itself runs only its requested documentation checks:

```sh
test -s docs/decisions/theming.md && git diff --check
```

The following are exact commands for the follow-up implementation, not checks run by T01. New
script/test names are deliverables assigned above. Run focused checks in the owning ticket; the
manager runs heavy package/build/measurement work through PROTOCOL, after checking load and
space. No screenshot baselines are updated for the no-config branch.

```sh
node packages/veneer-core/scripts/theme-schema.mjs --check
node site/scripts/theme-pages.mjs --check
node site/scripts/sample-width.mjs
node packages/veneer-core/scripts/split-css.mjs --check
node packages/veneer-core/scripts/theme-compat.mjs --baseline 90fbeee3
pnpm --filter @kerf/veneer-core exec vitest run \
  test/theme-schema.test.ts
pnpm --filter @kerf/veneer-core exec vitest run \
  test/theme-css.test.ts
pnpm --filter @kerf/veneer exec vitest run test/theme-types.test.ts
pnpm --filter @kerf/veneer exec tsc \
  -p test/theme-types.tsconfig.json --noEmit
pnpm --filter @kerf/veneer-core exec vitest run \
  test/theme-contrast.test.ts
pnpm --filter @kerf/veneer-core exec vitest run test/palette.test.ts
pnpm --filter @kerf/veneer exec vitest run \
  test/plugin.test.ts test/themes.test.ts
pnpm --filter @kerf/veneer exec vitest run test/theme-tone.test.tsx
pnpm --filter @kerf/veneer exec vitest run \
  test/palette.browser.test.tsx
pnpm --filter @kerf/veneer exec vitest run \
  test/tailwind-theme.test.ts
node packages/veneer/test/e2e/theme-entry.mjs --baseline 90fbeee3
node packages/veneer-core/scripts/contrast-check.mjs \
  packages/veneer-core/styles/veneer.css --json
node packages/veneer/scripts/size.mjs
pnpm run check --only=lint,types
node benchmarks/compare/measure.mjs
```

`theme-compat.mjs` compares every baseline tracked `packages/veneer-core/styles/*.css`
recursively, the old manifest, and veneer's bare-link, type, layout and Tailwind entries against
the candidate defaults. It prints checked/expected counts derived from `git ls-tree -r
--name-only 90fbeee3` and verifies the candidate inventory against `git ls-files`; themed
additions are listed separately. It must fail on a missing file, extra legacy path, changed byte
or absent baseline ref. Its `--negative-control` mode changes one byte in a temporary candidate
and exits nonzero. Prove it:

```sh
if node packages/veneer-core/scripts/theme-compat.mjs \
  --baseline 90fbeee3 --negative-control; then
  exit 1
fi
```

The ordinary-consumer fixture builds the same imports against baseline and candidate in one
owned staging root, pins the same compiler/toolchain, and compares concatenated emitted CSS
bytes with normalized asset filenames only. Exercise no plugin, `veneer()`, empty new
dictionaries, and existing seed/token/dial configs; the latter compare like-for-like old
configurations. The themed fixture must prove aliases select part-aware sheets for ordinary
imports, selective input sheets, bare anchors and the Tailwind entry. Also pack/install the
published exports in the manager's release gate; a workspace-only resolver pass is not package
proof.

Schema verification enumerates `git ls-files` for the ten canonical sheets plus three shims,
checks all 13 files against the inventory, and prints source declaration/binding/exclusion
counts. Every direct read and transitive input must have a record or an explicit
mechanical/external reason; a changed/new consumer or exclusion without evidence fails. Prove
this with a temporary unclassified padding read, a missing source file, a mismatched type/doc
digest and a bad unit. These mutations must each fail `theme-schema.mjs --check`; they are
fixtures, not changes to tracked source. Type tests accept the two roadmap examples and reject
press/active conflation, unknown scale names/paths and the wrong underline shape.

Negative tests include an unknown part/property/state, unknown colour, cyclic alias, nonfinite
family, dictionary collision, invalid palette, and a low-contrast pair in every part/state
family. Each must fail without suppressing unrelated pairs. Browser tests hold a frame/fill
sweep active, switch ocean to sunset and assert stroke, base, resting label and active text,
plus Nav's two indicators, Tabs, links, pills and fields. Check nested palette/dial order, root
and subtree reset, light/dark, persistence on reload before first paint, stale storage, blocked
storage, unknown setter atomicity, forced colours and reduced motion. Also assert spacing,
density, height, radius, border/ring widths, every type role, shadow, press scale, sweep
duration/easing, enter/stagger/animation-off and layout limits across palette/dial order. Check
local inline properties on one element against a sibling and a nested same-kind component.
Verify configured query thresholds on both sides, and reject inline variable breakpoint claims.
Test a colours-only opt-in against unchanged computed non-colour properties. Existing no-config
screenshots and interaction tests remain untouched and must pass.

T11 proves its page coverage check fails on a missing component, a missing/extra property-state
row and a changed default, then checks the full component-page count against the catalog. T12
checks that each knob updates the preview and printed config together, and that a frame palette
switch composes with light/dark, expression and width without resetting them. T09 verifies both
regenerated llms outputs contain the new options and table. These are follow-up checks, not T01
implementation evidence.

The manager also runs the affected package tests, type/lint checks and integration gate. It
commits the all-stack comparison history and regenerated chart once the integrated source is
measured, as CONTRIBUTING requires. Every new scenario runs across kerf + veneer, Solid, React +
Radix, React + Zustand and React + MUI. Record size and speed results; this design makes no size
or speed claim. Clean owned staging and stop owned test processes after verification.
