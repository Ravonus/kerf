// Break opportunities as Firefox finds them: a port of how Gecko transforms a text node's
// white space, sets up its text run and breaks its words with nsLineBreaker over ICU4X's
// line iterator, with Firefox's baked line data and the Unicode properties Gecko reads,
// which scripts/generate-engine-break-data.ts writes to src/generated/engine-break-data.ts.
//
// Sources, cited as file:line:
// - Gecko in mozilla-firefox at Firefox 156.0 (3bf8f4682).
// - icu_segmenter 2.1.2 src/line.rs, byte-identical to Firefox's third_party/rust copy.
//
// Deliberate differences:
// - Grapheme clusters come from the profile's ICU character rules (src/graphemes.ts), Chrome's,
//   which give the clusters of icu_segmenter's GraphemeClusterSegmenter over Firefox's data, and
//   Unicode properties from RegExp \p{...} and generated tables.
// - Text runs don't split where the script changes (gfxScriptItemizer.cpp), nor where the bidi
//   level does: bidi resolution makes a text frame of each level run (nsBidiPresUtils.cpp:
//   1037-1053), and a text run doesn't go on across two (ContinueTextRunAcrossFrames,
//   nsTextFrame.cpp:2023-2030). Such a split only adds a cluster start, restarts clusters within
//   its word and ends a word after a space before a cluster extender, so a level split is missed
//   only inside a cluster, or after a space inside one: for example at a vowel killer of a
//   left-to-right script after an Arabic letter, or at a ZWJ that ends the paragraph after a
//   Hebrew letter, which rule L1 puts at the paragraph's level. Both ports were removed on
//   purpose (RESEARCH.md, Decisions Log, 2026-09-24 and 2026-10-01; ENGINE_FOLLOWUPS.md, Bidi
//   levels, direction and script runs).
// - Inside runs of Thai, Lao, Khmer and Myanmar letters, Intl.Segmenter word boundaries stand
//   in for ICU4X's LSTM models (line.rs:445-451, complex/mod.rs:135-156). Firefox's own
//   Intl.Segmenter answers as those models there once breaks inside grapheme clusters are
//   dropped, which setPotentialLineBreaks does.
// - The paragraph is left-to-right, since Pretext takes no direction, and word-break is
//   normal or keep-all under Strict line breaking, which line-break: auto selects
//   (intl/lwbrk/LineBreaker.cpp:26-31).

import {
  geckoLineBreakStatesPacked,
  geckoLineEotProperty,
  geckoLineLastCodepointProperty,
  geckoLinePropertyCount,
} from './generated/engine-break-data.js'
import type { GraphemeTable } from './graphemes.js'
import { BREAK as OPPORTUNITY, CLUSTER_START, SOFT_HYPHEN_BREAK, getClass, getWordSegmenter, unpackClasses, unpackTable, type ClassTable } from './line-breaks.js'

import { CH_SHY, hasCompressedLeadingWhitespace, transformText } from './gecko-line-breaks-transform.js'
import { splitAndInitTextRun, type Glyphs } from './gecko-line-breaks-clusters.js'
export { isDiscardable, isEastAsianSegmentBreak, isJapaneseOrChinese, isSpaceCombiningSequenceTail, isSpaceOrTabOrSegmentBreak } from './gecko-line-breaks-transform.js'

type LineData = { readonly classes: ClassTable, readonly states: Uint8Array }
let lineData: LineData | null = null

// The Line_Break value, with error value 0 above U+10FFFF.
function getLineBreakClass(line: LineData, c: number): number {
  return c > 0x10ffff ? 0 : getClass(line.classes, c)
}

// Line_Break property values of the data (line.rs:18-128).
const AI = 1, AL = 3, BK = 10, CJ = 12, CM = 14, CR = 16, H2 = 21, H3 = 22, HY = 24, ID = 25, JL = 29,
  JT = 30, JV = 31, LF = 32, NL = 33, NU = 35, SA = 46, SP = 47, ZW = 53, ZWJ = 54
// BreakState bytes (provider/mod.rs:288-310).
const BREAK = 253, NO_MATCH = 254, KEEP = 255, INTERMEDIATE = 120

// LanguageIteratorUtf16 (complex/language.rs:17-45, 78-102) reads single code units: Thai, Lao,
// Burmese, Khmer, or 0 for Unknown, and Chinese and Japanese, for which the LSTM segmenter has no
// model (complex/mod.rs:161-180).
function getComplexLanguage(u: number): number {
  if (u >= 0xe01 && u <= 0xe7f) return 1
  if (u >= 0xe80 && u <= 0xeff) return 2
  if ((u >= 0x1000 && u <= 0x109f) || (u >= 0xa9e0 && u <= 0xa9ff) || (u >= 0xaa60 && u <= 0xaa7f)) return 3
  if ((u >= 0x1780 && u <= 0x17ff) || (u >= 0x19e0 && u <= 0x19ff)) return 4
  return 0
}

// complex_language_segment_utf16 (complex/mod.rs:135-156): splits a run of SA code units by
// language, and Intl.Segmenter words supply boundaries inside each Thai, Lao, Burmese and Khmer
// slice. Every slice reports its end; other languages report nothing else (:149-151).
function segmentComplex(units: number[]): number[] {
  const result: number[] = []
  for (let i = 0; i < units.length;) {
    const language = getComplexLanguage(units[i]!)
    let j = i + 1
    while (j < units.length && getComplexLanguage(units[j]!) === language) j++
    if (language !== 0) {
      let slice = ''
      for (let k = i; k < j; k += 4096) slice += String.fromCharCode(...units.slice(k, Math.min(j, k + 4096)))
      for (const part of getWordSegmenter().segment(slice)) if (part.index > 0) result.push(i + part.index)
    }
    result.push(j)
    i = j
  }
  return result
}

// KeepAll pairs (line.rs:901-907).
function isKeepAllLetter(p: number): boolean {
  return p === AI || p === AL || p === ID || p === NU || p === HY || p === H2 || p === H3 || p === JL ||
    p === JV || p === JT || p === CJ
}

// Utf16Indices::next (indices.rs:58-83): the code point at text[i], in a pair that ends before `end`,
// or an unpaired surrogate as a code point of its own.
function readCodePoint(text: string, i: number, end: number): number {
  const c = text.charCodeAt(i)
  if ((c & 0xfc00) === 0xd800 && i + 1 < end) {
    const next = text.charCodeAt(i + 1)
    if ((next & 0xfc00) === 0xdc00) return ((c & 0x3ff) << 10) + (next & 0x3ff) + 0x10000
  }
  return c
}

// LineBreakIterator (line.rs:820-1130) over the word text[start, end), drained: state[start + p] = 1
// at each break p inside the word that Iterator::next returns (:833-1067), which starts at the
// word's first code point after the break at 0 and stops at the word's end. The position is
// Utf16Indices' front_offset and current_pos_data (:821-823): `pos` is the current code point's
// offset in the word, `cp` its code point and `front` the next one's offset, and `pos` reaches
// the word's length past its end.
const intermediateBreak = (line: LineData, text: string, start: number, end: number, breakState: number, rightProp: number, afterZwj: boolean, front: number, pos: number, cp: number): [number, number, number, number] => {
  const states = line.states
  const len = end - start
  let index = breakState >= INTERMEDIATE ? breakState - INTERMEDIATE : breakState
  let prevFront = front
  let prevPos = pos
  let prevCp = cp
  let previousIsAfterZwj = afterZwj
  let leftPropPreLb9 = rightProp
  // (:976-981), where lb8a_after_lb9 is false once LB9 has passed.
  const isIntermediateRuleNoMatch = index > geckoLineLastCodepointProperty

  for (;;) {
    const innerAfterZwj = leftPropPreLb9 === ZWJ
    const previousBreakStateIsCpProp = index <= geckoLineLastCodepointProperty
    pos = front
    if (pos >= len) { // (:990-1007)
      if (states[index * geckoLinePropertyCount + geckoLineEotProperty] !== NO_MATCH) return [2, front, pos, cp]
      front = prevFront; pos = prevPos; cp = prevCp
      if (previousIsAfterZwj) return [0, front, pos, cp]
      return [1, front, pos, cp]
    }
    cp = readCodePoint(text, start + pos, end)
    front += cp > 0xffff ? 2 : 1
    const prop = getLineBreakClass(line, cp)

    if ((prop === CM || prop === ZWJ) && leftPropPreLb9 !== BK && leftPropPreLb9 !== CR && leftPropPreLb9 !== LF &&
      leftPropPreLb9 !== NL && leftPropPreLb9 !== SP && leftPropPreLb9 !== ZW) { // (:1009-1019)
      leftPropPreLb9 = prop
      continue
    }

    const next = states[index * geckoLinePropertyCount + prop]! // (:1021-1061)
    if (next === KEEP) return [0, front, pos, cp]
    if (next === NO_MATCH) {
      front = prevFront; pos = prevPos; cp = prevCp
      if (innerAfterZwj) {
        if (isIntermediateRuleNoMatch && !previousIsAfterZwj) return [1, front, pos, cp]
        return [0, front, pos, cp]
      }
      if (previousIsAfterZwj) return [0, front, pos, cp]
      return [1, front, pos, cp]
    }
    if (next === BREAK) {
      if (innerAfterZwj) return [0, front, pos, cp]
      return [1, front, pos, cp]
    }
    if (next >= INTERMEDIATE) {
      index = next - INTERMEDIATE
      prevFront = front; prevPos = pos; prevCp = cp
      previousIsAfterZwj = innerAfterZwj
    } else {
      index = next
      if (previousBreakStateIsCpProp) {
        prevFront = front; prevPos = pos; prevCp = cp
        previousIsAfterZwj = innerAfterZwj
      }
    }
    leftPropPreLb9 = prop
  }
}

const advanceCachedBreak = (text: string, start: number, end: number, cache: number[], cacheAt: number, cacheOffset: number, pos: number, front: number, cp: number): [number, number, number, number, number] | null => {
  const len = end - start
  const firstPos = cache[cacheAt++]! - cacheOffset
  let i = 0
  while (i !== firstPos) {
    i += cp > 0xffff ? 2 : 1 // Utf16::char_len (rule_segmenter.rs:335-341)
    pos = front
    if (pos >= len) return null
    cp = readCodePoint(text, start + pos, end)
    front += cp > 0xffff ? 2 : 1
  }
  cacheOffset += i
  return [cacheAt, cacheOffset, pos, front, cp]
}

const complexBreaks = (line: LineData, text: string, start: number, end: number, leftCodepoint: number, cp: number, pos: number, front: number): [number[], number, number, number, number, number] | null => {
  const len = end - start
  const units = [leftCodepoint & 0xffff]
  for (let p = pos, c = cp; ;) {
    units.push(c & 0xffff)
    p += c > 0xffff ? 2 : 1
    if (p >= len) break
    c = readCodePoint(text, start + p, end)
    if (getLineBreakClass(line, c) !== SA) break
  }
  const cache = segmentComplex(units)
  const cacheAt = 1
  let i = 1
  while (i !== cache[0]) {
    i++
    pos = front
    if (pos >= len) return null
    cp = readCodePoint(text, start + pos, end)
    front += cp > 0xffff ? 2 : 1
  }
  const cacheOffset = i
  return [cache, cacheAt, cacheOffset, pos, front, cp]
}

function markWordBreaks(line: LineData, text: string, start: number, end: number, keepAll: boolean, state: Uint8Array): void {
  const len = end - start
  const states = line.states
  let pos = 0
  let cp = readCodePoint(text, start, end)
  let front = cp > 0xffff ? 2 : 1
  // Break points cached by a complex-script run, each less `cacheOffset`, from `cacheAt`.
  let cache: number[] = []
  let cacheAt = 0
  let cacheOffset = 0

  for (;;) {
    // Break points cached by a complex-script run (:840-855).
    if (cacheAt < cache.length) {
      const advanced = advanceCachedBreak(text, start, end, cache, cacheAt, cacheOffset, pos, front, cp)
      if (advanced === null) return
      ;[cacheAt, cacheOffset, pos, front, cp] = advanced
      state[start + pos] = 1
      continue
    }

    let lb9Left = -1 // (:858)
    let lb8aAfterLb9 = false // (:861)
    for (;;) {
      const leftCodepoint = cp
      const leftProp = lb9Left >= 0 ? lb9Left : getLineBreakClass(line, leftCodepoint)
      const afterZwj = lb8aAfterLb9 || (lb9Left < 0 && leftProp === ZWJ)
      pos = front
      if (pos >= len) return
      cp = readCodePoint(text, start + pos, end)
      front += cp > 0xffff ? 2 : 1
      const rightProp = getLineBreakClass(line, cp)

      // LB9 (:878-893)
      if ((rightProp === CM || rightProp === ZWJ) && leftProp !== BK && leftProp !== CR && leftProp !== LF &&
        leftProp !== NL && leftProp !== SP && leftProp !== ZW) {
        lb9Left = leftProp
        lb8aAfterLb9 = rightProp === ZWJ
        continue
      }
      lb9Left = -1
      lb8aAfterLb9 = false

      // CSS word-break (:896-909)
      if (keepAll && isKeepAllLetter(leftProp) && isKeepAllLetter(rightProp)) continue

      // Complex scripts (:941-950), Utf16 line_handle_complex_language (:1263-1316), which counts
      // code points one unit each: they are truncated to u16 there.
      if (getLineBreakClass(line, leftCodepoint) === SA && rightProp === SA) {
        const complex = complexBreaks(line, text, start, end, leftCodepoint, cp, pos, front)
        if (complex === null) return
        ;[cache, cacheAt, cacheOffset, pos, front, cp] = complex
        break
      }

      const breakState = states[leftProp * geckoLinePropertyCount + rightProp]! // (:702-706, 953)
      if (breakState === BREAK || breakState === NO_MATCH) {
        if (afterZwj) continue
        break
      }
      if (breakState === KEEP) continue

      const [action, nextFront, nextPos, nextCp] = intermediateBreak(line, text, start, end, breakState, rightProp, afterZwj, front, pos, cp)
      front = nextFront; pos = nextPos; cp = nextCp
      if (action === 2) return
      if (action === 0) continue
      break
    }
    state[start + pos] = 1
  }
}

// --- 4. nsLineBreaker (dom/base/nsLineBreaker.cpp) ---

// kNonBreakableASCII, nsLineBreaker.cpp:33-48
const NON_BREAKABLE_ASCII = new Uint8Array([
  0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0,
])

// The break states of one text node: nsLineBreaker::AppendText with flags 0 while no word is
// buffered (16-bit :235-400, 8-bit :505-650), after AppendInvisibleWhitespace when leading white
// space was compressed (nsTextFrame.cpp:2978-2981, nsLineBreaker.cpp:695-708), then the last
// word's FlushCurrentWord from Reset (nsLineBreaker.cpp:134-226, 710-720). Each word of more than
// ASCII letters goes to LineBreaker::ComputeBreakPositions (intl/lwbrk/LineBreaker.cpp:112-194),
// which keeps the state before its first unit (AutoRestore, :342, :604; skipSet = 1, :200-206).
function getBreakStates(line: LineData, text: string, is8bit: boolean, afterLeadingWhitespace: boolean, keepAll: boolean): Uint8Array {
  const len = text.length
  const state = new Uint8Array(len)
  let afterBreakableSpace = afterLeadingWhitespace
  let wordStart = 0
  let wordMightBeBreakable = false
  for (let offset = 0; offset <= len; offset++) {
    const ch = offset < len ? text.charCodeAt(offset) : -1
    // nsLineBreaker::IsSegmentSpace, nsLineBreaker.h:260-264
    const isSpace = ch === 0x20 || ch === 0x09 || ch === 0x0d
    if (afterBreakableSpace && !isSpace && ch >= 0) state[offset] = 1
    afterBreakableSpace = isSpace
    if (ch >= 0 && !isSpace && (is8bit || ch !== 0x0a)) { // :332, :595
      // IsNonBreakableChar, nsLineBreaker.cpp:50-56
      if (!(ch >= 0x20 && ch <= 0x7f && NON_BREAKABLE_ASCII[ch - 0x20] === 1)) wordMightBeBreakable = true
      continue
    }
    if (offset > wordStart && wordMightBeBreakable) markWordBreaks(line, text, wordStart, offset, keepAll, state)
    wordMightBeBreakable = false
    wordStart = offset + 1
  }
  return state
}

// Where a line may start in a text node's source, after the segment break transformation that
// removeSkippableSegmentBreaks applies: a BREAK at flags[i] for 0 < i < source.length, at a normal
// break (FLAG_BREAK_TYPE_NORMAL) or after a soft hyphen. gfxTextRun::SetPotentialLineBreaks
// (gfxTextRun.cpp:210-236) keeps a break only at a cluster start or after a space. A normal break
// right after a soft hyphen adds SOFT_HYPHEN_BREAK: BreakAndMeasureText takes it as the normal
// break, which neither fits nor draws a hyphen (gfxTextRun.cpp:1053-1063). A CLUSTER_START marks
// where a cluster starts without a break, where only break-word can wrap (gfxTextRun.cpp:1068-1074).
// The breaks, whether the text run left out a bidi control, and 1 at each unit that a layout of
// the source leaves out where collapsing each run of adjacent white space wouldn't, or null where
// there is none: white space the text run collapsed in a run that read past a character it drops,
// and, in normal white space, an FF or a CR that no line feed follows, which the text run keeps
// with no advance (transformText).
export type GeckoLineBreaks = { breaks: Uint8Array, leftOut: Uint8Array | null, dropsBidiControl: boolean }

export function getGeckoLineBreaks(
  source: string,
  preserveWhiteSpace: boolean,
  keepAll: boolean,
  graphemeTable: GraphemeTable,
  // Where each item of a rich-inline paragraph starts in the source, or null for one text (transformText).
  frameStarts: number[] | null = null,
): GeckoLineBreaks {
  const len = source.length
  const flags = new Uint8Array(len + 1)
  if (len === 0) return { breaks: flags, leftOut: null, dropsBidiControl: false }
  let is8bit = true
  for (let i = 0; i < len && is8bit; i++) is8bit = source.charCodeAt(i) < 0x100
  // CharacterDataBuffer::SetTo stores 1b text when every unit is below 256 (CharacterDataBuffer.cpp:235-286).
  const tr = transformText(source, is8bit, preserveWhiteSpace, frameStarts)
  const n = tr.text.length
  if (n === 0) return { breaks: flags, leftOut: null, dropsBidiControl: tr.dropsBidiControl }

  // The text run is built before the break sinks are set up (nsTextFrame.cpp:2860-2864), in one
  // piece: Firefox splits it where the bidi level changes, which the scan leaves out (above).
  const g: Glyphs = { clusterStart: new Uint8Array(n).fill(1), isSpace: new Uint8Array(n) }
  splitAndInitTextRun(g, tr.text, graphemeTable, new Int32Array(n))

  const line = lineData ??= { classes: unpackClasses('gecko/line'), states: unpackTable(geckoLineBreakStatesPacked) }
  const state = getBreakStates(line, tr.text, is8bit, hasCompressedLeadingWhitespace(source, tr.skipped, is8bit, preserveWhiteSpace), keepAll)
  for (let t = 1; t < n; t++) {
    const rawPos = tr.orig[t]!
    const normal = state[t] === 1 && (g.clusterStart[t] === 1 || g.isSpace[t - 1] === 1)
    const afterSoftHyphen = tr.skipped[rawPos - 1] === 1 && source.charCodeAt(rawPos - 1) === CH_SHY
    if (normal || afterSoftHyphen) {
      flags[rawPos] = normal && afterSoftHyphen ? OPPORTUNITY | SOFT_HYPHEN_BREAK : OPPORTUNITY
    } else if (g.clusterStart[t] === 1) {
      flags[rawPos] = CLUSTER_START
    }
  }
  return { breaks: flags, leftOut: tr.leftOut, dropsBidiControl: tr.dropsBidiControl }
}
