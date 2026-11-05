import { isBidiControl } from './graphemes.js'
import { isDiscardable, isEastAsianSegmentBreak, isJapaneseOrChinese, isSpaceCombiningSequenceTail } from './gecko-line-breaks.js'
import type { AnalysisProfile } from './analysis-types.js'

// The runs that collapsing changes: a lone space is already the space its run becomes.
const collapsibleWhitespaceRunRe = /[ \t\n\r\f]{2,}|[\t\n\r\f]/g
const needsWhitespaceNormalizationRe = /[\t\n\r\f]| {2,}|^ | $/

function isSegmentBreakRunSpace(code: number, scan: AnalysisProfile['lineBreakScan']): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0A || (code === 0x0D && scan === 'blink')
}

// CSS segment break transformation in normal white space. Blink and Gecko
// delete a collapsible run containing LF when a ZWSP immediately precedes or
// follows the run; WebKit turns it into a space. Gecko also deletes it between two
// East Asian wide characters other than Hangul, and on a `ja` or `zh` page next to
// East Asian punctuation, reading past default-ignorable characters on both sides
// (TransformWhiteSpaces, nsTextFrameUtils.cpp:84-209, with the predicates of
// nsUnicharUtils.cpp:500-527). Each engine collects its own run, and engines Pretext
// doesn't recognize take Blink's, as they take its scan:
// - Blink: SPACE, TAB, LF and CR.
// - Gecko: SPACE, TAB and LF, continuing through the characters Gecko discards
//   (SHY and bidi controls) without ending on one, and leaving out a last SPACE
//   before a combining sequence tail. Text holding a ZWSP is 16-bit in Gecko.
// Characters outside the run, such as FF, keep the ordinary collapse, or take no room in the
// Gecko profile (analyzeText).
export function removeSkippableSegmentBreaks(text: string, profile: AnalysisProfile, language: string | null = null): string {
  const scan = profile.lineBreakScan
  if (scan === 'webkit' || !text.includes('\n')) return text
  const eastAsian = scan === 'gecko' && maybeEastAsianRe.test(text)
  if (!eastAsian && !text.includes('\u200B')) return text
  const japaneseOrChinese = eastAsian && isJapaneseOrChinese(language)
  let result = ''
  let copied = 0
  // Only a run containing LF can be removed. Expand each LF to its run once;
  // the next search starts where this run's scan stopped.
  for (let newline = text.indexOf('\n'); newline !== -1;) {
    let start = newline
    for (let index = newline - 1; index >= 0; index--) {
      const code = text.charCodeAt(index)
      if (isSegmentBreakRunSpace(code, scan)) start = index
      else if (!(scan === 'gecko' && isDiscardable(code, false))) break
    }
    let end = newline + 1
    let index = end
    for (; index < text.length; index++) {
      const code = text.charCodeAt(index)
      if (isSegmentBreakRunSpace(code, scan)) end = index + 1
      else if (!(scan === 'gecko' && isDiscardable(code, false))) break
    }
    newline = text.indexOf('\n', index)
    if (scan === 'gecko' && text.charCodeAt(end - 1) === 0x20 && isSpaceCombiningSequenceTail(text, end)) end--
    if (text.charCodeAt(start - 1) !== 0x200B && text.charCodeAt(end) !== 0x200B &&
      !(eastAsian && isEastAsianSegmentBreak(text, start, end, japaneseOrChinese))) continue
    result += text.slice(copied, start)
    for (let member = start; member < end; member++) {
      if (!isSegmentBreakRunSpace(text.charCodeAt(member), scan)) result += text[member]
    }
    copied = end
  }
  return copied === 0 ? text : result + text.slice(copied)
}

// Where the collapsible white space that ends text[from, text.length) starts, which the analysis
// leaves out and a line end trims, or the text's length where none ends it. Gecko's white-space
// run reads through the bidi controls in it and after it (TransformText, nsTextFrameUtils.cpp:
// 319-345), so there it is the first white space after the last character that is neither, and
// the controls stay.
export function getTrailingCollapsibleStart(text: string, from: number, profile: AnalysisProfile): number {
  let start = text.length
  for (let i = text.length - 1; i >= from; i--) {
    const code = text.charCodeAt(i)
    if (isCollapsibleSpaceCode(code)) start = i
    else if (!(profile.lineBreakScan === 'gecko' && isBidiControl(code))) break
  }
  return start
}

// Every East Asian wide, fullwidth or halfwidth character is at or above U+1100.
const maybeEastAsianRe = /[\u1100-\uFFFF]/

// Normal white space after the segment break transformation: each run of SPACE, TAB, LF,
// CR and FF becomes one space, or nothing at either end.
export function collapseWhitespaceNormal(text: string): string {
  if (!needsWhitespaceNormalizationRe.test(text)) return text

  let normalized = text.replace(collapsibleWhitespaceRunRe, ' ')
  if (normalized.charCodeAt(0) === 0x20) {
    normalized = normalized.slice(1)
  }
  if (normalized.length > 0 && normalized.charCodeAt(normalized.length - 1) === 0x20) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

export function normalizeWhitespacePreWrap(text: string): string {
  if (!/[\r\f]/.test(text)) return text
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[\r\f]/g, '\n')
}


export function isCollapsibleSpaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0A || code === 0x0D || code === 0x0C
}
