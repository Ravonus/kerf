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
import { CH_SHY, isSurrogatePair, combine, eastAsianWidths, isClusterExtender, isClusterExtenderExcludingJoiners, isInvalidChar, isDiscardable, isSpaceOrTab, isSpaceOrTabOrSegmentBreak, isSpaceCombiningSequenceTail, isEastAsianSegmentBreak, transformText, hasCompressedLeadingWhitespace, extendCluster, setupClusterBoundaries, splitAndInitTextRun, lineData, getLineBreakClass, AI, AL, BK, CJ, CM, CR, H2, H3, HY, ID, JL, JT, JV, LF, NL, NU, SA, SP, ZW, ZWJ, BREAK, NO_MATCH, KEEP, INTERMEDIATE, readCodePoint, markWordBreaks, NON_BREAKABLE_ASCII, getBreakStates, getGeckoLineBreaks, __resetEngineData } from './gecko-line-breaks.js'
import type { Transformed, Glyphs, LineData, GeckoLineBreaks } from './gecko-line-breaks.js'
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
export function isJapaneseOrChinese(language: string | null): boolean {
  const breakLanguage = getBreakLanguage(language)
  return (breakLanguage === 'ja' || breakLanguage === 'zh') && language!.charCodeAt(2) !== 0x5f
}
export function isTrimmableSpace(source: string, pos: number, is8bit: boolean): boolean {
  switch (source.charCodeAt(pos)) {
    case 0x20: case 0x1680: return is8bit || !isSpaceCombiningSequenceTail(source, pos + 1)
    case 0x0a: case 0x09: case 0x0d: case 0x0c: return true
    default: return false
  }
}
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
