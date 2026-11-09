// The intent vocabulary of style groups (research 23 §2.1): research 03's closed keys and token names, resolved to
// declarations through warp's token variables (docs/design/warp/tokens/warp.css, `--warp-*`). Both the types in
// @weft-js/core/style and the build-time resolver (./css.ts) read this one table. Plain data: the Vite plugin imports it in
// Node, so no syntax beyond what type stripping erases.

                                             

const scale = (prop        ) =>
  ({
    none: { [prop]: '0' },
    hair: { [prop]: 'var(--warp-space-hair)' },
    tight: { [prop]: 'var(--warp-space-tight)' },
    related: { [prop]: 'var(--warp-space-related)' },
    group: { [prop]: 'var(--warp-space-group)' },
    section: { [prop]: 'var(--warp-space-section)' },
    page: { [prop]: 'var(--warp-space-page)' },
  })         

/** Warp's tone channels (warp-components.css): a tone sets them once, and every group reads them. */
const tone = (t        )        => ({
  '--_solid': `var(--warp-color-${t}-solid)`,
  '--_solid-hover': `var(--warp-color-${t}-solid-hover)`,
  '--_ink-on': `var(--warp-color-${t}-on-solid)`,
  '--_soft': `var(--warp-color-${t}-soft)`,
  '--_text': `var(--warp-color-${t}-text)`,
  '--_border': `var(--warp-color-${t}-border)`,
})

const text = (role        , weight = true)        => ({
  'font-size': `var(--warp-text-${role}-size)`,
  'line-height': `var(--warp-text-${role}-leading)`,
  ...(weight ? { 'font-weight': `var(--warp-text-${role}-weight)` } : {}),
})

export const VOCAB = {
  /** Background role (03 §4.3 `color.surface*`). */
  surface: {
    page: { 'background-color': 'var(--warp-color-page)' },
    base: { 'background-color': 'var(--warp-color-surface)' },
    raised: { 'background-color': 'var(--warp-color-surface-raised)' },
    overlay: { 'background-color': 'var(--warp-color-surface-overlay)' },
    sunken: { 'background-color': 'var(--warp-color-surface-sunken)' },
    inverse: {
      'background-color': 'var(--warp-color-surface-inverse)',
      color: 'var(--warp-color-on-inverse)',
    },
  },
  pad: {
    ...scale('padding'),
    control: { padding: 'var(--warp-pad-control)' },
    surface: { padding: 'var(--warp-pad-surface)' },
  },
  padInline: {
    ...scale('padding-inline'),
    control: { 'padding-inline': 'var(--warp-pad-control)' },
  },
  padBlock: scale('padding-block'),
  gap: scale('gap'),
  radius: {
    none: { 'border-radius': '0' },
    mark: { 'border-radius': 'var(--warp-radius-mark)' },
    control: { 'border-radius': 'var(--warp-radius-control)' },
    surface: { 'border-radius': 'var(--warp-radius-surface)' },
    round: { 'border-radius': 'var(--warp-radius-round)' },
  },
  border: {
    none: { border: '0' },
    hairline: { border: 'var(--warp-border-hairline) solid var(--warp-color-border)' },
    strong: { border: 'var(--warp-border-hairline) solid var(--warp-color-border-strong)' },
    control: { border: 'var(--warp-border-hairline) solid var(--warp-color-border-control)' },
    tone: { border: 'var(--warp-border-hairline) solid var(--_border, var(--warp-color-border))' },
  },
  /** Row separators, for lists of rows. */
  divide: {
    hairline: { 'border-block-end': 'var(--warp-border-hairline) solid var(--warp-color-border)' },
  },
  elevation: {
    flat: { 'box-shadow': 'var(--warp-elevation-0)' },
    low: { 'box-shadow': 'var(--warp-elevation-1)' },
    mid: { 'box-shadow': 'var(--warp-elevation-2)' },
    high: { 'box-shadow': 'var(--warp-elevation-3)' },
  },
  tone: {
    neutral: tone('neutral'),
    accent: tone('accent'),
    positive: tone('positive'),
    caution: tone('caution'),
    critical: tone('critical'),
    info: tone('info'),
    highlight: tone('highlight'),
  },
  /** How the tone fills the element (03 §4.2 `emphasis`). Without a tone, `subtle` is subtle text. */
  emphasis: {
    ghost: { 'background-color': 'transparent', color: 'var(--_text, var(--warp-color-text))' },
    subtle: { color: 'var(--_text, var(--warp-color-text-subtle))' },
    soft: { 'background-color': 'var(--_soft)', color: 'var(--_text)' },
    solid: { 'background-color': 'var(--_solid)', color: 'var(--_ink-on)' },
    /** `solid`, hovered or pressed. */
    strong: { 'background-color': 'var(--_solid-hover)', color: 'var(--_ink-on)' },
    outline: {
      'box-shadow': 'inset 0 0 0 var(--warp-border-hairline) var(--_border)',
      color: 'var(--_text)',
    },
  },
  /** Text colour role, when the group doesn't take it from a tone. */
  ink: {
    text: { color: 'var(--warp-color-text)' },
    subtle: { color: 'var(--warp-color-text-subtle)' },
    faint: { color: 'var(--warp-color-text-faint)' },
    tone: { color: 'var(--_text)' },
  },
  /** Type role (03 §4.2 `role`). */
  text: {
    display: text('display'),
    title: text('title'),
    heading: text('heading'),
    // Body leaves its weight (400) to inheritance, as hand-written CSS does.
    body: text('body', false),
    label: text('label'),
    caption: text('caption', false),
    code: { ...text('code', false), 'font-family': 'var(--warp-font-mono)' },
    button: text('button'),
    eyebrow: text('eyebrow'),
  },
  font: {
    sans: { 'font-family': 'var(--warp-font-sans)' },
    mono: { 'font-family': 'var(--warp-font-mono)' },
    display: { 'font-family': 'var(--warp-font-display)' },
  },
  figures: { tabular: { 'font-variant-numeric': 'tabular-nums' } },
  layout: {
    block: { display: 'block' },
    stack: { display: 'flex', 'flex-direction': 'column' },
    row: { display: 'flex', 'flex-wrap': 'wrap', 'align-items': 'center' },
    inline: { display: 'inline-flex', 'align-items': 'center' },
    grid: { display: 'grid' },
  },
  align: {
    start: { 'align-items': 'start' },
    center: { 'align-items': 'center' },
    end: { 'align-items': 'end' },
    baseline: { 'align-items': 'baseline' },
    stretch: { 'align-items': 'stretch' },
  },
  justify: {
    start: { 'justify-content': 'start' },
    center: { 'justify-content': 'center' },
    end: { 'justify-content': 'end' },
    between: { 'justify-content': 'space-between' },
  },
  /** Push this item to the far end of its row. */
  push: { end: { 'margin-inline-start': 'auto' } },
  grow: { fill: { flex: '1' } },
  control: {
    sm: { 'min-block-size': 'var(--warp-control-sm)' },
    md: { 'min-block-size': 'var(--warp-control-md)' },
    lg: { 'min-block-size': 'var(--warp-control-lg)' },
  },
  ring: {
    focus: {
      outline: 'var(--warp-focus-width) solid var(--warp-color-focus)',
      'outline-offset': 'var(--warp-focus-offset)',
    },
    accent: { 'box-shadow': '0 0 0 var(--warp-focus-width) var(--warp-color-accent-solid)' },
    tone: { 'box-shadow': '0 0 0 var(--warp-focus-width) var(--_solid)' },
  },
  list: { plain: { 'list-style': 'none', margin: '0', padding: '0' } },
  cursor: { pointer: { cursor: 'pointer' }, blocked: { cursor: 'not-allowed' } },
  fade: { half: { opacity: '0.5' } },
}                                                         

                                
