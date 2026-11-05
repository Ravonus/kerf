// Cached Canvas metrics moved from @chenglou/pretext 1.0.0.
import type { FontMeasurement, SegmentMetrics } from './measurement-types.js'

// The font's context, set to the font and its shaping. Every measurement in a font takes
// its context from here as it measures, so none reads a width under another font's
// setting, whatever was looked up or prepared in between, and text that is all cached,
// which measures nothing, sets nothing. What changes the context after that puts it back
// before it returns (getHyphenText, getExtraSpacings, getFontSpaceKerning, isLigature).
export function getContext(measurement: FontMeasurement): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const state = measurement.state
  if (state.font !== measurement.canvasFont) state.context.font = state.font = measurement.canvasFont
  if (state.letterSpacing !== measurement.letterSpacing) state.context.letterSpacing = state.letterSpacing = measurement.letterSpacing
  return state.context
}

// The lookup internalizes seg, and a string V8 hashes for the first time there gets a one-byte
// copy where its units fit, so Canvas is handed a Latin-1 segment one-byte, which Chrome measures
// as Latin (RESEARCH.md, Keeping Work Bounded, String Storage). A segment cut from a longer text
// is a new string, so the lookup is its first hash. A text that is one segment is the caller's
// own string, since a slice of a whole string is that string, and so is a rich item that is one
// segment (prepareRichInline() in src/rich-inline.ts): a two-byte one that something hashed
// before without internalizing it, as a RegExp made from it does, stays two-byte.
export function getSegmentMetrics(seg: string, measurement: FontMeasurement): SegmentMetrics {
  return measurement.metrics.get(seg) ?? addMetrics(measurement.metrics, seg, seg, measurement)
}

// Metrics of seg measured together with one following U+0020.
export function getFollowingSpaceMetrics(seg: string, measurement: FontMeasurement): SegmentMetrics {
  return measurement.followingSpaceMetrics.get(seg) ?? addMetrics(measurement.followingSpaceMetrics, seg, seg + ' ', measurement)
}

function addMetrics(cache: Map<string, SegmentMetrics>, seg: string, text: string, measurement: FontMeasurement): SegmentMetrics {
  const metrics: SegmentMetrics = { width: getContext(measurement).measureText(text).width, emojiCount: -1, fit: null, spaceKerning: null, extraSpacings: null }
  cache.set(seg, metrics)
  measurement.state.segments++
  if (!measurement.measuredKana && kanaRe.test(seg)) measurement.measuredKana = true
  return metrics
}

// A character of the Hiragana and Katakana blocks, U+3041 to U+30FF, two of them in a row, and
// how many the blocks hold.
const kanaRe = /[\u3041-\u30FF]/
// The font's space, which holds no emoji. Every text asks for it, so it is kept beside the font's
// Map, which still answers the first one.
export function getSpaceWidth(measurement: FontMeasurement): number {
  return measurement.spaceWidth ??= getSegmentMetrics(' ', measurement).width
}

