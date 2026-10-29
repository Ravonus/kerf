// weft's `measure` provider: the smallest pure surface weft/text needs from a text engine. Another provider
// (an SSR advance-table estimator, a test double) implements the same four calls.

export type PrepareOptions = {
  whiteSpace?: 'normal' | 'pre-wrap'
  wordBreak?: 'normal' | 'keep-all'
  letterSpacing?: number // px
  // Keep each segment's text so lineText() can return a line's string (canvas painting). Costs memory.
  segments?: boolean
}

// An opaque handle. `exact` is false while a lazy pack the text needs is still loading; layout() then
// returns an estimate, and the same handle becomes exact once `ready` settles (no re-prepare by the caller).
export interface Handle {
  readonly exact: boolean
  readonly ready: Promise<void> | null
}

export type LayoutResult = { height: number, lineCount: number }

// A line as a range of the prepared text: segment and grapheme cursors as Pretext gives them (Pretext has
// no source offsets for plain text yet, upstream issue #198), and the line's width without hanging spaces.
export type Cursor = { segmentIndex: number, graphemeIndex: number }
export type LineRange = { width: number, start: Cursor, end: Cursor }

export interface MeasureProvider {
  prepare(text: string, font: string, opts?: PrepareOptions): Handle
  layout(handle: Handle, width: number, lineHeight: number): LayoutResult
  lines(handle: Handle, width: number): LineRange[]
  clear(): void
}

// What this engine adds on top: lazy packs, line text, locale. Not part of the provider contract.
// 'exact' is the exact tier itself (specialised Pretext); the others are its own lazy packs.
export type Pack = 'exact' | 'complex' | 'scripts' | 'spacing' | 'families' | 'rare'
export interface TextEngine extends MeasureProvider {
  readonly engine: 'blink' | 'webkit' | 'gecko'
  // Packs this text needs beyond the base chunk. Cheap: one code point scan.
  needs(text: string, font: string, opts?: PrepareOptions): Pack[]
  load(packs: readonly Pack[]): Promise<void>
  loaded(): readonly Pack[]
  lineText(handle: Handle, line: LineRange): string
  setLocale(locale?: string): void
}
