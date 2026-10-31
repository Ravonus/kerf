// weft/ds: the design language's closed vocabulary (PLAN §6, research 36), the names every primitive, style group and
// D-code agrees on. Names only: the values are warp's tokens (./style/vocab.ts maps these to them), the primitives are
// `@weft/warp`, and the checks are `weft check`'s D-codes. `weft tokens` exports the resolved values as DTCG.

export const SPACE = ['none', 'hair', 'tight', 'related', 'group', 'section', 'page'] as const
export const TONE = ['neutral', 'accent', 'positive', 'caution', 'critical', 'info'] as const
export const EMPHASIS = ['solid', 'soft', 'outline', 'ghost', 'frame', 'link'] as const
export const SIZE = ['sm', 'md', 'lg'] as const
export const DENSITY = ['compact', 'cozy', 'comfortable'] as const
export const TEXT_ROLE = ['display', 'title', 'heading', 'body', 'label', 'caption', 'eyebrow', 'code'] as const

export type Space = (typeof SPACE)[number]
export type Tone = (typeof TONE)[number]
export type Emphasis = (typeof EMPHASIS)[number]
export type Size = (typeof SIZE)[number]
export type Density = (typeof DENSITY)[number]
export type TextRole = (typeof TEXT_ROLE)[number]
