// The intent vocabulary of style groups (research 23 §2.1): research 03's closed keys and token names, resolved to
// declarations through veneer's token variables (docs/design/veneer/tokens/veneer.css, `--veneer-*`). Both the types in
// @kerf-js/core/style and the build-time resolver (./css.ts) read this one table. Plain data: the Vite plugin imports it in
// Node, so no syntax beyond what type stripping erases.

                                             

const scale = (prop        ) =>
  ({
    none: { [prop]: '0' },
    hair: { [prop]: 'var(--veneer-space-hair)' },
    tight: { [prop]: 'var(--veneer-space-tight)' },
    related: { [prop]: 'var(--veneer-space-related)' },
    group: { [prop]: 'var(--veneer-space-group)' },
    section: { [prop]: 'var(--veneer-space-section)' },
    page: { [prop]: 'var(--veneer-space-page)' },
  })         

/** Veneer's tone channels (veneer-components.css): a tone sets them once, and every group reads them. */
const tone = (t        )        => ({
  '--_solid': `var(--veneer-color-${t}-solid)`,
  '--_solid-hover': `var(--veneer-color-${t}-solid-hover)`,
  '--_ink-on': `var(--veneer-color-${t}-on-solid)`,
  '--_soft': `var(--veneer-color-${t}-soft)`,
  '--_text': `var(--veneer-color-${t}-text)`,
  '--_border': `var(--veneer-color-${t}-border)`,
})

const text = (role        , weight = true)        => ({
  'font-size': `var(--veneer-text-${role}-size)`,
  'line-height': `var(--veneer-text-${role}-leading)`,
  ...(weight ? { 'font-weight': `var(--veneer-text-${role}-weight)` } : {}),
})

export const VOCAB = {
  /** Background role (03 §4.3 `color.surface*`). */
  surface: {
    page: { 'background-color': 'var(--veneer-color-page)' },
    base: { 'background-color': 'var(--veneer-color-surface)' },
    raised: { 'background-color': 'var(--veneer-color-surface-raised)' },
    overlay: { 'background-color': 'var(--veneer-color-surface-overlay)' },
    sunken: { 'background-color': 'var(--veneer-color-surface-sunken)' },
    inverse: {
      'background-color': 'var(--veneer-color-surface-inverse)',
      color: 'var(--veneer-color-on-inverse)',
    },
  },
  pad: {
    ...scale('padding'),
    control: { padding: 'var(--veneer-pad-control)' },
    surface: { padding: 'var(--veneer-pad-surface)' },
  },
  padInline: {
    ...scale('padding-inline'),
    control: { 'padding-inline': 'var(--veneer-pad-control)' },
  },
  padBlock: scale('padding-block'),
  gap: scale('gap'),
  radius: {
    none: { 'border-radius': '0' },
    mark: { 'border-radius': 'var(--veneer-radius-mark)' },
    control: { 'border-radius': 'var(--veneer-radius-control)' },
    surface: { 'border-radius': 'var(--veneer-radius-surface)' },
    round: { 'border-radius': 'var(--veneer-radius-round)' },
  },
  border: {
    none: { border: '0' },
    hairline: { border: 'var(--veneer-border-hairline) solid var(--veneer-color-border)' },
    strong: { border: 'var(--veneer-border-hairline) solid var(--veneer-color-border-strong)' },
    control: { border: 'var(--veneer-border-hairline) solid var(--veneer-color-border-control)' },
    tone: {
      border: 'var(--veneer-border-hairline) solid var(--_border, var(--veneer-color-border))',
    },
  },
  /** Row separators, for lists of rows. */
  divide: {
    hairline: {
      'border-block-end': 'var(--veneer-border-hairline) solid var(--veneer-color-border)',
    },
  },
  elevation: {
    flat: { 'box-shadow': 'var(--veneer-elevation-0)' },
    low: { 'box-shadow': 'var(--veneer-elevation-1)' },
    mid: { 'box-shadow': 'var(--veneer-elevation-2)' },
    high: { 'box-shadow': 'var(--veneer-elevation-3)' },
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
    ghost: { 'background-color': 'transparent', color: 'var(--_text, var(--veneer-color-text))' },
    subtle: { color: 'var(--_text, var(--veneer-color-text-subtle))' },
    soft: { 'background-color': 'var(--_soft)', color: 'var(--_text)' },
    solid: { 'background-color': 'var(--_solid)', color: 'var(--_ink-on)' },
    /** `solid`, hovered or pressed. */
    strong: { 'background-color': 'var(--_solid-hover)', color: 'var(--_ink-on)' },
    outline: {
      'box-shadow': 'inset 0 0 0 var(--veneer-border-hairline) var(--_border)',
      color: 'var(--_text)',
    },
  },
  /** Text colour role, when the group doesn't take it from a tone. */
  ink: {
    text: { color: 'var(--veneer-color-text)' },
    subtle: { color: 'var(--veneer-color-text-subtle)' },
    faint: { color: 'var(--veneer-color-text-faint)' },
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
    code: { ...text('code', false), 'font-family': 'var(--veneer-font-mono)' },
    button: text('button'),
    eyebrow: text('eyebrow'),
  },
  font: {
    sans: { 'font-family': 'var(--veneer-font-sans)' },
    mono: { 'font-family': 'var(--veneer-font-mono)' },
    display: { 'font-family': 'var(--veneer-font-display)' },
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
    sm: { 'min-block-size': 'var(--veneer-control-sm)' },
    md: { 'min-block-size': 'var(--veneer-control-md)' },
    lg: { 'min-block-size': 'var(--veneer-control-lg)' },
  },
  ring: {
    focus: {
      outline: 'var(--veneer-focus-width) solid var(--veneer-color-focus)',
      'outline-offset': 'var(--veneer-focus-offset)',
    },
    accent: { 'box-shadow': '0 0 0 var(--veneer-focus-width) var(--veneer-color-accent-solid)' },
    tone: { 'box-shadow': '0 0 0 var(--veneer-focus-width) var(--_solid)' },
  },
  list: { plain: { 'list-style': 'none', margin: '0', padding: '0' } },
  cursor: { pointer: { cursor: 'pointer' }, blocked: { cursor: 'not-allowed' } },
  fade: { half: { opacity: '0.5' } },
}                                                         

                                
