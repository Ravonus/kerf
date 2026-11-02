// @weft-js/core/ds: the design language's closed vocabulary (PLAN §6, research 36), the names every primitive, style group and
// D-code agrees on. Names only: the values are warp's tokens (./style/vocab.ts maps these to them), the primitives are
// `@weft-js/warp`, and the checks are `weft check`'s D-codes. `weft tokens` exports the resolved values as DTCG.

/** The steps of space, from none to a page's margin. */
export const SPACE = ['none', 'hair', 'tight', 'related', 'group', 'section', 'page'] as const
/** What a colour means. */
export const TONE = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const
/** How loudly a control or surface carries its tone. */
export const EMPHASIS = ['solid', 'soft', 'outline', 'ghost', 'frame', 'link'] as const
/** Control sizes. */
export const SIZE = ['sm', 'md', 'lg'] as const
/** How tightly a view packs its content. */
export const DENSITY = ['compact', 'cozy', 'comfortable'] as const
/** What a piece of text is, which sets its size and weight. */
export const TEXT_ROLE = ['display', 'title', 'heading', 'body', 'label', 'caption', 'eyebrow', 'code'] as const

/** One of `SPACE`. */
export type Space = (typeof SPACE)[number]
/** One of `TONE`. */
export type Tone = (typeof TONE)[number]
/** One of `EMPHASIS`. */
export type Emphasis = (typeof EMPHASIS)[number]
/** One of `SIZE`. */
export type Size = (typeof SIZE)[number]
/** One of `DENSITY`. */
export type Density = (typeof DENSITY)[number]
/** One of `TEXT_ROLE`. */
export type TextRole = (typeof TEXT_ROLE)[number]
