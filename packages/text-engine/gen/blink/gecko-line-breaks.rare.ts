// Moved here from gecko-line-breaks.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import {
  geckoLineBreakStatesPacked,
  geckoLineEotProperty,
  geckoLineLastCodepointProperty,
  geckoLinePropertyCount,
} from './generated/engine-break-data.js'
import { findGraphemeEnds, isBidiControl, type GraphemeTable } from './graphemes.js'
import {
  BREAK as OPPORTUNITY,
  CLUSTER_START,
  DEFAULT_IGNORABLE,
  EMOJI,
  HANGUL,
  MARK,
  PUNCTUATION,
  SOFT_HYPHEN_BREAK,
  getBreakLanguage,
  getClass,
  getWordSegmenter,
  hasProperty,
  unpackClasses,
  unpackTable,
  type ClassTable,
} from './line-breaks.js'
import { CH_SHY, isSurrogatePair, combine, eastAsianWidths, isSpaceOrTabOrSegmentBreak, isEastAsianSegmentBreak, lineData, getGeckoLineBreaks, __resetEngineData } from './gecko-line-breaks.js'
import type { Transformed, Glyphs, LineData, GeckoLineBreaks } from './gecko-line-breaks.js'
export function isClusterExtender(cp: number): boolean {
  return cp >= 0x0300 && (hasProperty(cp, MARK) || cp === 0x200c || cp === 0x200d || (cp >= 0xff9e && cp <= 0xff9f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) || (cp >= 0xe0020 && cp <= 0xe007f))
}
export function isClusterExtenderExcludingJoiners(cp: number): boolean {
  return cp >= 0x0300 && (hasProperty(cp, MARK) || (cp >= 0xff9e && cp <= 0xff9f) || (cp >= 0x1f3fb && cp <= 0x1f3ff) ||
    (cp >= 0xe0020 && cp <= 0xe007f))
}
export function isEastAsianWidthFHWExcludingEmoji(widths: ClassTable, cp: number): boolean {
  const width = getClass(widths, cp)
  return width === 2 || width === 3 || (width === 5 && !hasProperty(cp, EMOJI))
}
export function isSegmentBreakSkipChar(widths: ClassTable, cp: number): boolean {
  return isEastAsianWidthFHWExcludingEmoji(widths, cp) && !hasProperty(cp, HANGUL) && cp !== 0x20a9
}
export function isEastAsianPunctuation(widths: ClassTable, cp: number): boolean {
  return getClass(widths, cp) !== 0 && ((hasProperty(cp, PUNCTUATION) && cp !== 0x20a9) || cp === 0xff5e || cp === 0x3000)
}
export function isInvalidChar(ch: number): boolean {
  if (ch >= 0x20 && ch < 0x7f) return false
  if (ch <= 0x9f) return true
  return ((ch & 0xff00) === 0x2000 && (ch === 0x200b || ch === 0x2028 || ch === 0x2029 || ch === 0x2060)) ||
    ch === 0xfeff || isBidiControl(ch)
}
export function isDiscardable(ch: number, is8bit: boolean): boolean {
  return ch === CH_SHY || (!is8bit && isBidiControl(ch))
}
export const isSpaceOrTab = (ch: number) => ch === 0x20 || ch === 0x09
export function isSpaceCombiningSequenceTail(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (isClusterExtenderExcludingJoiners(ch)) return true
    if (!isBidiControl(ch)) return false
  }
  return false
}
export function isJapaneseOrChinese(language: string | null): boolean {
  const breakLanguage = getBreakLanguage(language)
  return (breakLanguage === 'ja' || breakLanguage === 'zh') && language!.charCodeAt(2) !== 0x5f
}
export function transformText(input: string, is8bit: boolean, preserveWhiteSpace: boolean, frameStarts: number[] | null): Transformed {
  const len = input.length
  // The source index of each kept unit.
  const orig = new Int32Array(len)
  const skipped = new Uint8Array(len)
  let leftOut: Uint8Array | null = null
  let n = 0
  let dropsBidiControl = false
  if (preserveWhiteSpace) {
    // COMPRESS_NONE, nsTextFrameUtils.cpp:222-271
    for (let i = 0; i < len; i++) {
      const ch = input.charCodeAt(i)
      if (!isDiscardable(ch, is8bit)) {
        orig[n++] = i
      } else {
        skipped[i] = 1
        dropsBidiControl ||= ch !== CH_SHY
      }
    }
  } else {
    // COMPRESS_WHITESPACE_NEWLINE, :272-387
    let inWhitespace = false
    let i = 0
    // Where the frame a white-space run starts in ends, the next frame start past the run's start:
    // the input's end for one text. Only a run reads it, so it is found where one starts.
    let frame = 0
    let frameEnd = frameStarts === null ? len : 0
    while (i < len) {
      const ch = input.charCodeAt(i)
      if (!isSpaceOrTabOrSegmentBreak(ch) && !isDiscardable(ch, is8bit)) {
        // A CR or FF is no white space to TransformText (:51-57), so it ends a white-space run and
        // stays in the text run, which gives it no glyph and no advance: it skips a control
        // character it doesn't draw as a hexbox, which is never CR and, in release and beta builds,
        // no other one either (gfxFont::SplitAndInitTextRun, gfxFont.cpp:3620-3627 and :3874-3892;
        // layout.css.control-characters.visible, StaticPrefList.yaml:10926-10929). Every Canvas
        // measures it as a space (Firefox's: CanvasRenderingContext2D.cpp:4634-4637), so a layout
        // of the source leaves it out. Kept as a control of no advance, as the profile keeps the
        // other controls Firefox hides (hidesControlCharacters), it is text at a line's edges,
        // where Firefox trims it, and takes text with CRLF off the simple line walk (RESEARCH.md,
        // Dead Ends). A CR right before a line feed needs no mark: the run that starts there keeps
        // that line feed, and the CR, a breakable space to the scan too, collapses into it.
        if (ch === 0x0c || (ch === 0x0d && input.charCodeAt(i + 1) !== 0x0a)) (leftOut ??= new Uint8Array(len))[i] = 1
        orig[n++] = i
        inWhitespace = false
        i++
        continue
      }
      if (isSpaceOrTabOrSegmentBreak(ch)) {
        if (i >= frameEnd) {
          while (frame < frameStarts!.length && frameStarts![frame]! <= i) frame++
          frameEnd = frame < frameStarts!.length ? frameStarts![frame]! : len
        }
        let keepLastSpace = false
        let hasSegmentBreak = ch === 0x0a
        let trailingDiscardables = 0
        // How many characters the run holds that the text run drops.
        let dropped = 0
        // A run that goes on from the frame before, after the characters that frame's run dropped at
        // its end, leaves out white space that doesn't touch the unit the run kept.
        const goesOnPastDropped = inWhitespace && i > 0 && isDiscardable(input.charCodeAt(i - 1), is8bit)
        let j = i + 1
        for (; j < frameEnd; j++) {
          const c = input.charCodeAt(j)
          if (c === 0x0a) hasSegmentBreak = true
          else if (isDiscardable(c, is8bit)) dropped++
          else if (!isSpaceOrTab(c)) break
        }
        while (isDiscardable(input.charCodeAt(j - 1), is8bit)) { j--; trailingDiscardables++ } // :334-336
        if (!is8bit && input.charCodeAt(j - 1) === 0x20 && j < frameEnd && isSpaceCombiningSequenceTail(input, j)) { keepLastSpace = true; j-- } // :339-345
        // TransformWhiteSpaces over [i, j), :84-209. The runs it deletes whole, next to a ZWSP or
        // between East Asian characters (:120-150), are gone already (removeSkippableSegmentBreaks in
        // src/analysis.ts), so a run keeps one space. A space or tab in a run with a segment break
        // goes (:152-162), and the run's first segment break stays as a space (:181-193).
        for (let k = i; k < j; k++) {
          const c = input.charCodeAt(k)
          if (isDiscardable(c, is8bit)) {
            skipped[k] = 1
            dropsBidiControl ||= c !== CH_SHY
          } else if (inWhitespace || (hasSegmentBreak && isSpaceOrTab(c))) {
            skipped[k] = 1
            // Where the run reads through a dropped character, white space it leaves out may not
            // touch the unit it keeps, so collapsing adjacent white space wouldn't drop it.
            if (dropped > trailingDiscardables || goesOnPastDropped) (leftOut ??= new Uint8Array(len))[k] = 1
          } else {
            orig[n++] = k
            inWhitespace = true
          }
        }
        if (keepLastSpace) orig[n++] = j++
        for (let k = 0; k < trailingDiscardables; k++) {
          dropsBidiControl ||= input.charCodeAt(j) !== CH_SHY
          skipped[j++] = 1
        }
        i = j
        continue
      }
      skipped[i] = 1 // :370-379
      dropsBidiControl ||= ch !== CH_SHY
      inWhitespace = false
      i++
    }
  }
  // The kept units, as slices of the input where they run unchanged: in collapsed white space, a kept
  // tab or segment break becomes a space.
  let text = ''
  let sliceStart = 0
  let sliceEnd = 0
  for (let k = 0; k < n; k++) {
    const i = orig[k]!
    const ch = input.charCodeAt(i)
    if (!preserveWhiteSpace && (ch === 0x09 || ch === 0x0a)) {
      text += input.slice(sliceStart, sliceEnd) + ' '
      sliceStart = sliceEnd = i + 1
    } else if (i !== sliceEnd) {
      text += input.slice(sliceStart, sliceEnd)
      sliceStart = i
      sliceEnd = i + 1
    } else {
      sliceEnd++
    }
  }
  text += input.slice(sliceStart, sliceEnd)
  return { text, orig: orig.subarray(0, n), skipped, leftOut, dropsBidiControl }
}
export function isTrimmableSpace(source: string, pos: number, is8bit: boolean): boolean {
  switch (source.charCodeAt(pos)) {
    case 0x20: case 0x1680: return is8bit || !isSpaceCombiningSequenceTail(source, pos + 1)
    case 0x0a: case 0x09: case 0x0d: case 0x0c: return true
    default: return false
  }
}
export function hasCompressedLeadingWhitespace(source: string, skipped: Uint8Array, is8bit: boolean, preserveWhiteSpace: boolean): boolean {
  if (preserveWhiteSpace || skipped[0] === 0) return false
  for (let k = 0; k < source.length && skipped[k] === 1; k++) if (isTrimmableSpace(source, k, is8bit)) return true
  return false
}
export function extendCluster(g: Glyphs, i: number): void {
  g.clusterStart[i] = 0
  g.isSpace[i] = 0
}
export function setupClusterBoundaries(g: Glyphs, text: string, from: number, to: number, graphemeTable: GraphemeTable, ends: Int32Array): void {
  let ch0 = text.charCodeAt(from)
  if (to - from > 1 && isSurrogatePair(ch0, text.charCodeAt(from + 1))) ch0 = combine(ch0, text.charCodeAt(from + 1))
  if (isClusterExtender(ch0)) extendCluster(g, from)
  let low = from
  while (low < to && text.charCodeAt(low) < 0x300) low++
  const count = low === to ? 0 : findGraphemeEnds(graphemeTable, text, from, to, ends)
  for (let k = 0, pos = from; pos < to; k++) {
    const ch = text.charCodeAt(pos)
    if (ch === 0x20 || ch === 0x3000) g.isSpace[pos] = 1
    else if (ch === 0x09af && pos > from && text.charCodeAt(pos - 1) === 0x09cd) extendCluster(g, pos) // BENGALI_YA after BENGALI_VIRAMA
    const end = count === 0 ? pos + 1 : ends[k]!
    for (pos++; pos < end; pos++) extendCluster(g, pos)
  }
}
export function splitAndInitTextRun(g: Glyphs, text: string, graphemeTable: GraphemeTable, ends: Int32Array): void {
  const end = text.length
  let wordStart = 0
  for (let i = 0; i < end; i++) {
    const ch = text.charCodeAt(i)
    const boundary = (ch === 0x20 || ch === 0xa0) && !(i + 1 < end && isClusterExtender(text.charCodeAt(i + 1)))
    if (!boundary && !isInvalidChar(ch)) continue
    if (i > wordStart) setupClusterBoundaries(g, text, wordStart, i, graphemeTable, ends)
    if (ch === 0x20) g.isSpace[i] = 1
    wordStart = i + 1
  }
  if (end > wordStart) setupClusterBoundaries(g, text, wordStart, end, graphemeTable, ends)
}
export function getLineBreakClass(line: LineData, c: number): number {
  return c > 0x10ffff ? 0 : getClass(line.classes, c)
}
export const AI = 1, AL = 3, BK = 10, CJ = 12, CM = 14, CR = 16, H2 = 21, H3 = 22, HY = 24, ID = 25, JL = 29,
  JT = 30, JV = 31, LF = 32, NL = 33, NU = 35, SA = 46, SP = 47, ZW = 53, ZWJ = 54
export const BREAK = 253, NO_MATCH = 254, KEEP = 255, INTERMEDIATE = 120
export function getComplexLanguage(u: number): number {
  if (u >= 0xe01 && u <= 0xe7f) return 1
  if (u >= 0xe80 && u <= 0xeff) return 2
  if ((u >= 0x1000 && u <= 0x109f) || (u >= 0xa9e0 && u <= 0xa9ff) || (u >= 0xaa60 && u <= 0xaa7f)) return 3
  if ((u >= 0x1780 && u <= 0x17ff) || (u >= 0x19e0 && u <= 0x19ff)) return 4
  return 0
}
export function segmentComplex(units: number[]): number[] {
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
export function isKeepAllLetter(p: number): boolean {
  return p === AI || p === AL || p === ID || p === NU || p === HY || p === H2 || p === H3 || p === JL ||
    p === JV || p === JT || p === CJ
}
export function readCodePoint(text: string, i: number, end: number): number {
  const c = text.charCodeAt(i)
  if ((c & 0xfc00) === 0xd800 && i + 1 < end) {
    const next = text.charCodeAt(i + 1)
    if ((next & 0xfc00) === 0xdc00) return ((c & 0x3ff) << 10) + (next & 0x3ff) + 0x10000
  }
  return c
}
export function markWordBreaks(line: LineData, text: string, start: number, end: number, keepAll: boolean, state: Uint8Array): void {
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
      const firstPos = cache[cacheAt++]! - cacheOffset
      let i = 0
      while (i !== firstPos) {
        i += cp > 0xffff ? 2 : 1 // Utf16::char_len (rule_segmenter.rs:335-341)
        pos = front
        if (pos >= len) return
        cp = readCodePoint(text, start + pos, end)
        front += cp > 0xffff ? 2 : 1
      }
      cacheOffset += i
      state[start + pos] = 1
      continue
    }

    let lb9Left = -1 // (:858)
    let lb8aAfterLb9 = false // (:861)
    outer: for (;;) {
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
        const units = [leftCodepoint & 0xffff]
        for (let p = pos, c = cp; ;) {
          units.push(c & 0xffff)
          p += c > 0xffff ? 2 : 1
          if (p >= len) break
          c = readCodePoint(text, start + p, end)
          if (getLineBreakClass(line, c) !== SA) break
        }
        cache = segmentComplex(units)
        cacheAt = 1
        let i = 1
        while (i !== cache[0]) {
          i++
          pos = front
          if (pos >= len) return
          cp = readCodePoint(text, start + pos, end)
          front += cp > 0xffff ? 2 : 1
        }
        cacheOffset = i
        break
      }

      const breakState = states[leftProp * geckoLinePropertyCount + rightProp]! // (:702-706, 953)
      if (breakState === BREAK || breakState === NO_MATCH) {
        if (afterZwj) continue
        break
      }
      if (breakState === KEEP) continue

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
          if (states[index * geckoLinePropertyCount + geckoLineEotProperty] !== NO_MATCH) return
          front = prevFront; pos = prevPos; cp = prevCp
          if (previousIsAfterZwj) continue outer
          break outer
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
        if (next === KEEP) continue outer
        if (next === NO_MATCH) {
          front = prevFront; pos = prevPos; cp = prevCp
          if (innerAfterZwj) {
            if (isIntermediateRuleNoMatch && !previousIsAfterZwj) break outer
            continue outer
          }
          if (previousIsAfterZwj) continue outer
          break outer
        }
        if (next === BREAK) {
          if (innerAfterZwj) continue outer
          break outer
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
    state[start + pos] = 1
  }
}
export const NON_BREAKABLE_ASCII = new Uint8Array([
  0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0,
])
export function getBreakStates(line: LineData, text: string, is8bit: boolean, afterLeadingWhitespace: boolean, keepAll: boolean): Uint8Array {
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
