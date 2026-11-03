// Moved here from line-breaks.ts by scripts/specialize.mjs (pack "rare"). Upstream code, unchanged.
import {
  appleQuoteRemaps,
  blinkLinePairsPacked,
  classMaps,
  classRemapsPacked,
  classRunsVarints,
  jointClassCount,
  ruleTables,
  webkitLinePairsPacked,
  type ClassMap,
  type RuleTable,
} from './generated/engine-break-data.js'
import { BREAK, CLUSTER_START, FORCED_BREAK, SOFT_HYPHEN_BREAK, ITEM_START, getBreakLanguage, unpackTable, unpackVarints, getClass, unpackClassRuns, classRuns, classRemaps, unpackClasses, lazyRegExp, LETTER_OR_NUMBER, MARK, PUNCTUATION, PUNCTUATION_BUT_DASH_OR_CONNECTOR, DEFAULT_IGNORABLE, EMOJI, HANGUL, wordSegmenter, getWordSegmenter, clearWordSegmenter, START_STATE, STOP_STATE, ACCEPTING_UNCONDITIONAL, unpackStateRows, unpackTableRows, breakRules, getBreakRules, NO_OVERRIDES, markRuleBoundaries, SPACE, TAB, LF, LINE_SEPARATOR, PARAGRAPH_SEPARATOR, AL, ID, CM, OP, CP, CL, GL, QU, SP, PI, PF, WEIRD, webkitPairs, webkitLineRules, isWebKitBreakableSpace, isASCIIDigit, isASCIIAlpha, classify, createFactory, following, nextBreakablePosition, getWebKitLineRules, TEXT, WHITESPACE, SOFT_LINE_BREAK, getWebKitLineBreaks, getWebKitBreakBetweenItems, __resetEngineData, markDictionaryWords } from './line-breaks.js'
import type { BreakLanguage, ClassTable, BreakRules, CategoryOverrides, ChromiumLineTable, WebKitLineRules, Factory } from './line-breaks.js'
export const PROPERTY_TESTS = [
  lazyRegExp(String.raw`^[\p{L}\p{N}]$`, 'u'),
  lazyRegExp(String.raw`^\p{M}$`, 'u'),
  lazyRegExp(String.raw`^\p{P}$`, 'u'),
  lazyRegExp(String.raw`^[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Po}]$`, 'u'),
  lazyRegExp(String.raw`^\p{Default_Ignorable_Code_Point}$`, 'u'),
  lazyRegExp(String.raw`^\p{Emoji}$`, 'u'),
  lazyRegExp(String.raw`^\p{sc=Hangul}$`, 'u'),
]
export let bmpProperties: Uint16Array | null = null
export const astralProperties = new Map<number, number>()
export function hasProperty(cp: number, property: number): boolean {
  const bmp = bmpProperties ??= new Uint16Array(0x10000)
  const has = 1 << (property * 2)
  let bits = cp < 0x10000 ? bmp[cp]! : astralProperties.get(cp) ?? 0
  if ((bits & has << 1) === 0) {
    bits |= has << 1 | (PROPERTY_TESTS[property]!().test(String.fromCodePoint(cp)) ? has : 0)
    if (cp < 0x10000) bmp[cp] = bits
    else astralProperties.set(cp, bits)
  }
  return (bits & has) !== 0
}
export function isComplexContext(rules: BreakRules, c: number): boolean {
  return getClass(rules.classes, c) >= rules.dictCategoriesStart
}
export const ZWSP = 0x200b
export const IDEOGRAPHIC_SPACE = 0x3000
export let blinkPairs: Uint8Array | null = null
export let blinkDefaultLocale: string | undefined
export function getBlinkDefaultLocale(): string {
  return blinkDefaultLocale ??= new Intl.DateTimeFormat().resolvedOptions().locale
}
export const NO_BREAK = 0
export const CAN_BREAK = 1
export const UNKNOWN = 2
export function isBlinkBreakableSpace(c: number): boolean {
  return c === SPACE || c === TAB || c === LF
}
export function shouldBreakFast(pairs: Uint8Array, lastLast: number, last: number, ch: number): number {
  if (last < 0x21 || ch < 0x21) return NO_BREAK
  if (last === 0x2d) {
    if (ch <= 0x7f) {
      if (ch >= 0x30 && ch <= 0x39) {
        const lower = lastLast | 0x20
        return (lastLast >= 0x30 && lastLast <= 0x39) || (lower >= 0x61 && lower <= 0x7a) ? CAN_BREAK : NO_BREAK
      }
    } else {
      return UNKNOWN
    }
  }
  if (last <= 0xff && ch <= 0xff) {
    const x = ch - 0x21
    return (pairs[(last - 0x21) * 28 + (x >> 3)]! & (1 << (x & 7))) !== 0 ? CAN_BREAK : NO_BREAK
  }
  return UNKNOWN
}
export function shouldKeepAfterKeepAll(rules: BreakRules, lastLast: number, last: number, ch: number): boolean {
  const pre = hasProperty(last, MARK) ? lastLast : last
  return hasProperty(pre, LETTER_OR_NUMBER) && !isComplexContext(rules, pre) &&
    hasProperty(ch, LETTER_OR_NUMBER) && !isComplexContext(rules, ch)
}
export function getBlinkLineBreaks(text: string, keepAll: boolean, language: string | null): Uint8Array {
  const length = text.length
  const breaks = new Uint8Array(length + 1)
  if (length < 2) return breaks
  const pairs = blinkPairs ??= unpackTable(blinkLinePairsPacked)
  const table: ChromiumLineTable = getBreakLanguage(language) === 'zh' ? 'line_normal_cj' : 'line_normal'
  const rules = getBreakRules(`chromium/${table}`)
  let icu: Uint8Array | null = null
  let lastLast = 0
  let last = text.charCodeAt(0)
  for (let i = 1; i < length; lastLast = last, last = text.charCodeAt(i), i++) {
    const ch = text.charCodeAt(i)
    if (isBlinkBreakableSpace(ch)) continue // tbi.cc:284-291
    if (isBlinkBreakableSpace(last)) { breaks[i] = 1; continue }
    const fast = shouldBreakFast(pairs, lastLast, last, ch)
    if (fast === CAN_BREAK) { breaks[i] = 1; continue } // tbi.cc:305-309
    if (keepAll && shouldKeepAfterKeepAll(rules, lastLast, last, ch)) continue // tbi.cc:338-344
    if (fast === NO_BREAK) continue // tbi.cc:346-348
    // tbi.cc:350-383: ICU's first boundary after i - 1 is i exactly when i is a boundary,
    // since the unit before it isn't a space here.
    if (icu === null) {
      icu = new Uint8Array(length + 1)
      markRuleBoundaries(rules, text, icu)
    }
    if (icu[i] === 1) breaks[i] = 1
  }
  return breaks
}
export function nextBreakableSpace(s: string, startPosition: number, punctuationBreaks: boolean): number {
  for (let i = startPosition; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (isWebKitBreakableSpace(c) || c === ZWSP) return i
    if (c === IDEOGRAPHIC_SPACE) return i + 1
    if (punctuationBreaks && hasProperty(c, PUNCTUATION_BUT_DASH_OR_CONNECTOR) && i + 1 < s.length) return i + 1
  }
  return s.length
}
