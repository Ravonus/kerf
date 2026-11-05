// Source mapping moved from @chenglou/pretext 1.0.0 rich-inline.ts.
import { alignToSource } from '../analysis.js'
import { getEngineProfile } from '../measurement.js'
import type { InternalPreparedRichInline } from '../rich-inline-types.js'

// Where units [from, to) of a paragraph's normalized text are in the text of the item that starts
// at `itemStart`, from the offset in the paragraph's text each unit comes from, where they aren't
// one stretch of it: Gecko removes a line feed between two ideographs, and white space after a bidi
// control that follows white space. Else null.
export function getSourceUnits(offsets: Int32Array, from: number, to: number, itemStart: number): number[] | null {
  if (to <= from || offsets[to - 1]! - offsets[from]! === to - 1 - from) return null
  const units: number[] = []
  for (let unit = from; unit < to; unit++) units.push(offsets[unit]! - itemStart)
  return units
}

// Per frozen handle of a paragraph that is one text's handle, the three lists of where its
// segments are in the item's text (InternalPreparedRichInline), found when a line of it is
// first materialized. A handle keeps them itself; a frozen one can't take them, so they are
// kept beside it, as its segments' grapheme ends are (getGraphemeEnds): no line function writes
// to a frozen handle or to anything it holds, so one the app froze, or a copy of one in a store
// that freezes its state, materializes as any other. Kept beside every handle, the lookup took
// a pass that walks and materializes 3,000 of the chat demo's one-item paragraphs, each asked
// once, 35-47% longer with the handles out of the processor's caches and 7-25% with them in,
// and 40 of them over and over 1-9% (JavaScriptCore of bun 1.4.2, V8 15.4 and node 23.10's,
// SpiderMonkey 156, one build a process on the harness's stand-in Canvas, 2026-10-12). Found
// while preparing, the lists took such paragraphs 6-13% longer to prepare and count once in
// JavaScriptCore and 12-20% in V8, text seen before, and a third more heap a handle, for lines
// a long list mostly never paints; found again at every line, walking and materializing took
// 5-9 times as long, and over 100 times in a paragraph of 6,000 units.
type TextSources = { sourceStarts: number[]; sourceEnds: number[]; sourceUnits: (number[] | null)[] }
export const textSources = new WeakMap<InternalPreparedRichInline, TextSources>()

// Per segment of a paragraph that is one text's handle, where its text starts and ends in the
// item's.
export function findSegmentSources(flow: InternalPreparedRichInline): TextSources {
  const { segments } = flow.data
  const offsets = alignToSource(flow.text, segments.join(''), getEngineProfile().lineBreakScan)
  const sourceStarts: number[] = []
  const sourceEnds: number[] = []
  const sourceUnits: (number[] | null)[] = []
  for (let i = 0, at = 0; i < segments.length; at += segments[i++]!.length) {
    const end = offsets[at + segments[i]!.length - 1]! + 1
    sourceStarts.push(offsets[at]!)
    sourceEnds.push(flow.text.charCodeAt(end - 1) === 0x0D && flow.text.charCodeAt(end) === 0x0A && segments[i] === '\n' ? end + 1 : end)
    sourceUnits.push(getSourceUnits(offsets, at, at + segments[i]!.length, 0))
  }
  const sources = { sourceStarts, sourceEnds, sourceUnits }
  if (Object.isFrozen(flow)) {
    textSources.set(flow, sources)
  } else {
    flow.sourceStarts = sourceStarts
    flow.sourceEnds = sourceEnds
    flow.sourceUnits = sourceUnits
  }
  return sources
}

// Where unit `unit` of a segment's text is in its item's text.
export function getSourceOffset(sourceStarts: number[], sourceUnits: (number[] | null)[] | null, segmentIndex: number, unit: number): number {
  const units = sourceUnits === null ? null : sourceUnits[segmentIndex]!
  return units === null ? sourceStarts[segmentIndex]! + unit : units[unit]!
}

