// Moved here from line-breaks.ts by scripts/specialize.mjs (pack "scripts"). Upstream code, unchanged.
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
import { BREAK, CLUSTER_START, FORCED_BREAK, SOFT_HYPHEN_BREAK, ITEM_START, getBreakLanguage, unpackTable, unpackVarints, getClass, unpackClassRuns, classRuns, classRemaps, unpackClasses, lazyRegExp, LETTER_OR_NUMBER, MARK, PUNCTUATION, PUNCTUATION_BUT_DASH_OR_CONNECTOR, DEFAULT_IGNORABLE, EMOJI, HANGUL, wordSegmenter, getWordSegmenter, clearWordSegmenter, START_STATE, STOP_STATE, ACCEPTING_UNCONDITIONAL, unpackStateRows, unpackTableRows, breakRules, getBreakRules, NO_OVERRIDES, markRuleBoundaries, SPACE, TAB, LF, LINE_SEPARATOR, PARAGRAPH_SEPARATOR, AL, ID, CM, OP, CP, CL, GL, QU, SP, PI, PF, WEIRD, webkitPairs, webkitLineRules, isWebKitBreakableSpace, isASCIIDigit, isASCIIAlpha, classify, createFactory, following, nextBreakablePosition, getWebKitLineRules, TEXT, WHITESPACE, SOFT_LINE_BREAK, getWebKitLineBreaks, getWebKitBreakBetweenItems, __resetEngineData, hasProperty, isComplexContext, getBlinkDefaultLocale, isBlinkBreakableSpace, shouldBreakFast, shouldKeepAfterKeepAll, getBlinkLineBreaks, nextBreakableSpace } from './line-breaks.js'
import type { BreakLanguage, ClassTable, BreakRules, CategoryOverrides, ChromiumLineTable, WebKitLineRules, Factory } from './line-breaks.js'
export function markDictionaryWords(rules: BreakRules, text: string, start: number, end: number, flags: Uint8Array): void {
  let runStart = -1
  for (let i = start; i <= end;) {
    let dictionary = false
    let size = 1
    if (i < end) {
      let c = text.charCodeAt(i)
      if ((c & 0xfc00) === 0xd800 && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
        c = ((c - 0xd800) << 10) + text.charCodeAt(i + 1) - 0xdc00 + 0x10000
        size = 2
      }
      dictionary = isComplexContext(rules, c)
    }
    if (dictionary) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      if (i - runStart > 1) {
        for (const segment of getWordSegmenter().segment(text.slice(runStart, i))) {
          if (segment.index > 0) flags[runStart + segment.index] = 1
        }
      }
      runStart = -1
    }
    i += size
  }
}
