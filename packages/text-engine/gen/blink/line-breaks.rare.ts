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
import { BREAK, CLUSTER_START, FORCED_BREAK, SOFT_HYPHEN_BREAK, ITEM_START, getBreakLanguage, unpackTable, unpackVarints, getClass, unpackClassRuns, classRuns, classRemaps, unpackClasses, lazyRegExp, PROPERTY_TESTS, LETTER_OR_NUMBER, MARK, PUNCTUATION, PUNCTUATION_BUT_DASH_OR_CONNECTOR, DEFAULT_IGNORABLE, EMOJI, HANGUL, bmpProperties, astralProperties, hasProperty, wordSegmenter, getWordSegmenter, clearWordSegmenter, START_STATE, STOP_STATE, ACCEPTING_UNCONDITIONAL, unpackStateRows, unpackTableRows, breakRules, getBreakRules, NO_OVERRIDES, markRuleBoundaries, SPACE, TAB, LF, blinkPairs, NO_BREAK, CAN_BREAK, UNKNOWN, isBlinkBreakableSpace, shouldBreakFast, getBlinkLineBreaks, webkitLineRules, __resetEngineData, markDictionaryWords } from './line-breaks.js'
import type { BreakLanguage, ClassTable, BreakRules, CategoryOverrides, ChromiumLineTable, WebKitLineRules, Factory } from './line-breaks.js'
export function isComplexContext(rules: BreakRules, c: number): boolean {
  return getClass(rules.classes, c) >= rules.dictCategoriesStart
}
export const ZWSP = 0x200b
export const LINE_SEPARATOR = 0x2028
export const PARAGRAPH_SEPARATOR = 0x2029
export const IDEOGRAPHIC_SPACE = 0x3000
export let blinkDefaultLocale: string | undefined
export function getBlinkDefaultLocale(): string {
  return blinkDefaultLocale ??= new Intl.DateTimeFormat().resolvedOptions().locale
}
export function shouldKeepAfterKeepAll(rules: BreakRules, lastLast: number, last: number, ch: number): boolean {
  const pre = hasProperty(last, MARK) ? lastLast : last
  return hasProperty(pre, LETTER_OR_NUMBER) && !isComplexContext(rules, pre) &&
    hasProperty(ch, LETTER_OR_NUMBER) && !isComplexContext(rules, ch)
}
export const AL = 1
export const ID = 2
export const CM = 4
export const OP = 8
export const CP = 16
export const CL = 32
export const GL = 64
export const QU = 128
export const SP = 256
export const PI = 512
export const PF = 1024
export const WEIRD = 32768
export let webkitPairs: Uint8Array | null = null
export function isWebKitBreakableSpace(c: number): boolean {
  return c === SPACE || c === LF || c === TAB || c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR
}
export function isASCIIDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39
}
export function isASCIIAlpha(c: number): boolean {
  const lower = c | 0x20
  return lower >= 0x61 && lower <= 0x7a
}
export function classify(c: number): number {
  switch (c >> 7) {
    case 0:
      switch (c >> 4) {
        case 0: return WEIRD
        case 1: return CM
        case 2: return c === 0x20 ? SP : c === 0x22 || c === 0x27 ? QU : c === 0x28 ? OP : c === 0x29 ? CP : WEIRD
        case 3: return c <= 0x39 ? AL : WEIRD
        case 4: return AL
        case 5: return c <= 0x5a ? AL : c === 0x5b ? OP : c === 0x5d ? CP : WEIRD
        case 6: return AL
        default: return c <= 0x7a ? AL : c === 0x7b ? OP : c === 0x7d ? CL : WEIRD
      }
    case 1:
      if (c === 0xa0) return GL
      if (c > 0xc0) return AL
      if (c === 0xa1 || c === 0xbf) return OP
      if (c === 0xab) return QU | PI
      if (c === 0xbb) return QU | PF
      return WEIRD
    case 2: case 3: case 4: return AL
    case 5: return c === 0x2c8 || c === 0x2cc || c === 0x2df ? WEIRD : AL
    case 6:
      if (c === 0x34f || (c >= 0x35c && c <= 0x362)) return GL
      if (c < 0x370) return CM
      if (c === 0x37e) return WEIRD
      return AL
    case 7: case 8: case 10: return AL
    case 9: return c >= 0x483 && c <= 0x489 ? CM : AL
    case 11:
      if (c <= 0x588 || c >= 0x5c8) return AL
      if (c >= 0x591 && c <= 0x5bd) return CM
      return c === 0x5bf || c === 0x5c1 || c === 0x5c2 || c === 0x5c4 || c === 0x5c5 || c === 0x5c7 ? CM : WEIRD
    case 64:
      if (c === 0x2018 || c === 0x201c) return QU | PI
      if (c === 0x2019 || c === 0x201d) return QU | PF
      return WEIRD
    default:
      if (c >= 0x2e80 && c <= 0xa4cf) {
        if ((c & 0xff00) === 0x3000) {
          if (c <= 0x303f) {
            switch (c & 0x1f) {
              case 0x01: case 0x02: case 0x09: case 0x0b: case 0x0d: case 0x0f: case 0x11: case 0x15: case 0x17:
              case 0x19: case 0x1b: case 0x1e: case 0x1f:
                return CL
              case 0x08: case 0x0a: case 0x0c: case 0x0e: case 0x10: case 0x16: case 0x14: case 0x18: case 0x1a:
              case 0x1d:
                return OP
              default:
                return WEIRD
            }
          }
          return WEIRD
        }
        if ((c & 0xfff0) === 0x31f0) return WEIRD
        if ((c & 0xfff8) === 0x3248) return AL
        if ((c & 0xffc0) === 0x4dc0) return AL
        if (c === 0xa015) return WEIRD
        return ID
      }
      if (c >= 0xac00 && c <= 0xd7af) return ID
      if (c >= 0xf900 && c <= 0xfaff) return ID
      return WEIRD
  }
}
export function createFactory(text: string, line: WebKitLineRules): Factory {
  return { text, secondToLast: 0, last: 0, priorLength: 0, line, nextBoundary: null }
}
export function following(f: Factory, location: number): number {
  let next = f.nextBoundary
  if (next === null) {
    const prior = f.priorLength === 2
      ? String.fromCharCode(f.secondToLast, f.last)
      : f.priorLength === 1 ? String.fromCharCode(f.last) : ''
    const text = prior + f.text
    const flags = new Uint8Array(text.length + 1)
    markRuleBoundaries(f.line.rules, text, flags, f.line.overrides)
    next = new Int32Array(text.length + 2)
    next[text.length + 1] = -1
    for (let p = text.length; p >= 0; p--) next[p] = flags[p] === 1 ? p : next[p + 1]!
    f.nextBoundary = next
  }
  const o = location + f.priorLength + 1
  if (o >= next.length) return -1
  const b = next[o]!
  return b < 0 ? -1 : b - f.priorLength
}
export function nextBreakablePosition(pairs: Uint8Array, f: Factory, startPosition: number): number {
  const s = f.text
  const length = s.length
  if (startPosition === 0 && f.priorLength === 0) {
    if (length <= 1) return length
    startPosition++
  }
  let beforeBefore = startPosition > 1 ? s.charCodeAt(startPosition - 2) : f.secondToLast
  let before = startPosition > 0 ? s.charCodeAt(startPosition - 1) : f.last
  let beforeType = 0
  let after = 0
  let afterType = 0
  let nextBreak = -1
  for (let i = startPosition; i < length; beforeBefore = before, before = after, beforeType = afterType, i++) {
    after = s.charCodeAt(i)
    afterType = 0
    if (isWebKitBreakableSpace(after)) return i
    // ASCII rapid lookup.
    if (before === 0x2d && isASCIIDigit(after)) {
      if (isASCIIDigit(beforeBefore) || isASCIIAlpha(beforeBefore)) return i
      continue
    }
    if (before <= 0xff && after <= 0xff) {
      if (before >= 0x21 && after >= 0x21) {
        const x = after - 0x21
        if ((pairs[(before - 0x21) * 28 + (x >> 3)]! & (1 << (x & 7))) !== 0) return i
      }
      continue
    }
    // Non-ASCII rapid lookup.
    if (beforeType === 0) beforeType = classify(before)
    afterType = classify(after)
    const pair = beforeType | afterType
    if ((pair & ~(SP | AL | QU | PI | PF)) === 0) continue
    if ((pair | AL) === (ID | AL)) return i
    if ((pair & (GL | QU)) !== 0 && (pair & WEIRD) === 0) {
      // A quotation mark next to East Asian text breaks before it when it opens and
      // after it when it closes (LB19a).
      if ((pair & ID) !== 0 && (pair & QU) !== 0 && ((afterType & PI) !== 0 || (beforeType & PF) !== 0)) return i
      continue
    }
    if (afterType === CM) {
      afterType = beforeType
      continue
    }
    if ((pair & WEIRD) === 0 && (pair & (CL | CP | OP)) !== 0) {
      if (afterType === CL || afterType === CP || beforeType === OP) continue
      if ((pair & ID) !== 0) return i
    }
    // ICU lookup.
    if (nextBreak < i) nextBreak = following(f, i - 1)
    if (nextBreak >= 0 && i < nextBreak) {
      for (const max = Math.min(nextBreak, length - 1); i < max; beforeBefore = before, before = after, beforeType = afterType, i++) {
        const lookahead = s.charCodeAt(i + 1)
        if (lookahead <= 0xff && !isASCIIAlpha(lookahead)) break
      }
    }
    if (i === nextBreak && !isWebKitBreakableSpace(before)) return i
  }
  return length
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
export function getWebKitLineRules(language: string | null): WebKitLineRules {
  const locale = language ?? ''
  let line = webkitLineRules.get(locale)
  if (line !== undefined) return line
  const breakLanguage = getBreakLanguage(locale)
  const rules = getBreakRules(breakLanguage === 'ja' || breakLanguage === 'ko' ? 'apple/line_normal' : breakLanguage === 'zh' ? 'apple/line_cj' : 'apple/line')
  const subtags = locale.split(/[-_]/)
  let name = subtags[0]!.toLowerCase()
  for (let k = 1; k < subtags.length; k++) {
    const subtag = subtags[k]!
    name += '_' + (subtag.length === 4 ? subtag[0]!.toUpperCase() + subtag.slice(1).toLowerCase() : subtag.toUpperCase())
  }
  let remap = appleQuoteRemaps[name]
  while (remap === undefined) {
    const cut = name.lastIndexOf('_')
    name = cut < 0 ? '' : name.slice(0, cut)
    remap = appleQuoteRemaps[name]
  }
  const chars: number[] = []
  const categories: number[] = []
  for (let k = 0; k < remap.length; k += 2) {
    chars.push(remap[k]!)
    categories.push(getClass(rules.classes, remap[k + 1] === 0 ? 0x7b : 0x7d))
  }
  line = { rules, overrides: { chars, categories } }
  webkitLineRules.set(locale, line)
  return line
}
export const TEXT = 0
export const WHITESPACE = 1
export const SOFT_LINE_BREAK = 2
export function getWebKitLineBreaks(
  source: string,
  preserveNewlines: boolean,
  keepAll: boolean,
  language: string | null,
): Uint8Array {
  const pairs = webkitPairs ??= unpackTable(webkitLinePairsPacked)
  const f = createFactory(source, getWebKitLineRules(language))
  const length = source.length
  const breaks = new Uint8Array(length + 1)
  // WebKit stores a text holding a code unit above U+00FF in 16 bits, where keep-all also
  // breaks after punctuation.
  let sixteenBit = false
  for (let i = 0; keepAll && i < length && !sixteenBit; i++) sixteenBit = source.charCodeAt(i) > 0xff
  let previousKind = -1
  // handleTextContent, IIB:924-1051, for hyphens manual and nbsp-mode normal.
  for (let position = 0; position < length;) {
    let kind = WHITESPACE
    let end = position
    const c = source.charCodeAt(position)
    if (c === LINE_SEPARATOR || c === PARAGRAPH_SEPARATOR || (preserveNewlines && c === LF)) {
      // handleSegmentBreak, IIB:954-962.
      kind = SOFT_LINE_BREAK
      end++
      if (c !== LF) breaks[end] = FORCED_BREAK
    } else {
      // handleWhitespace, IIB:963-992, with moveToNextNonWhitespacePosition (IIB:55-73).
      for (; end < length; end++) {
        const c = source.charCodeAt(end)
        if (c !== SPACE && c !== TAB && (preserveNewlines || c !== LF)) break
      }
      if (end === position) {
        // handleNonWhitespace, IIB:1012-1038, with moveToNextBreakablePosition (IIB:75-87),
        // TU:398-422 with line-break auto (LineMode Default, TU:450-466) and BP.h:287-300.
        kind = TEXT
        end = length
        for (let p = position; p < length; p++) {
          const next = keepAll ? nextBreakableSpace(source, p, sixteenBit) : nextBreakablePosition(pairs, f, p)
          if (next !== position) { end = next; break }
        }
      }
    }
    // IFU:336-355, 406-418: the scan split same-level items, and wrapping is allowed next
    // to white space.
    if (previousKind >= 0 && previousKind !== SOFT_LINE_BREAK && kind !== SOFT_LINE_BREAK) breaks[position] = 1
    previousKind = kind
    position = end
  }
  return breaks
}
export function getWebKitBreakBetweenItems(previous: string, next: string, keepAll: boolean, language: string | null): boolean {
  const last = previous.charCodeAt(previous.length - 1)
  const first = next.charCodeAt(0)
  if (first === LF || first === LINE_SEPARATOR || first === PARAGRAPH_SEPARATOR) return false
  if (last === SPACE || last === TAB || first === SPACE || first === TAB) return true
  if (keepAll) return nextBreakableSpace(next, 0, false) === 0
  const pairs = webkitPairs ??= unpackTable(webkitLinePairsPacked)
  const f = createFactory(next, getWebKitLineRules(language))
  const n = previous.length
  f.secondToLast = n > 1 ? previous.charCodeAt(n - 2) : 0
  f.last = n > 0 ? previous.charCodeAt(n - 1) : 0
  f.priorLength = f.last === 0 ? 0 : f.secondToLast === 0 ? 1 : 2
  return nextBreakablePosition(pairs, f, 0) === 0
}
