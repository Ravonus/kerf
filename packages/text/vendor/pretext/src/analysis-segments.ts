import { isBidiControl } from './graphemes.js'
import { isDiscardable } from './gecko-line-breaks.js'
import { BREAK, CLUSTER_START, FORCED_BREAK, ITEM_START, SOFT_HYPHEN_BREAK } from './line-breaks.js'
import { CONTROL, HARD_BREAK, KIND_BITS, ONE_CLUSTER, PRESERVED_SPACE, RETURNABLE, SOFT_HYPHEN, SPACE, TAB, TEXT, UNBROKEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE, type AnalysisProfile, type SegmentKindCode, type TextAnalysis, type WhiteSpaceMode } from './analysis-types.js'
import { isCollapsibleSpaceCode } from './analysis-whitespace.js'

const combiningMarkRe = /\p{M}/u

function classifySegmentBreakCode(code: number, whiteSpace: WhiteSpaceMode, scan: AnalysisProfile['lineBreakScan']): SegmentKindCode {
  if (whiteSpace === 'pre-wrap') {
    if (code === 0x20) return PRESERVED_SPACE
    if (code === 0x09) return TAB
    if (code === 0x0A) return HARD_BREAK
  }
  if (code === 0x20) return SPACE
  if (code === 0x200B) return ZERO_WIDTH_BREAK
  if (code === 0x00AD) return SOFT_HYPHEN
  // NEL (UAX #14 NL) offers a break after itself and no ordinary break before it (LB5, LB6),
  // as the scans find. The WebKit profile gives NEL its own control segment for letter
  // spacing: WebKit's simple text path gives NEL no letter spacing, at either sign, and its
  // complex path spaces it. A NEL control segment takes spacing after text in WebKit's
  // complex ranges, or before such text that starts with a combining mark. Preparation
  // cannot see the page direction, so after complex text whose direction differs from the
  // page's it keeps spacing Safari omits. Blink spaces NEL outside cursive runs, and release
  // Gecko draws NEL with no advance while its Canvas measures a space, so both keep NEL as
  // ordinary text.
  if (code === 0x0085 && scan === 'webkit') return CONTROL
  return TEXT
}


// WebKit and Gecko scan a text node's source, where normalization collapsed white space: in
// normal white space each run of SPACE, TAB, LF, CR and FF became one space, or nothing
// at either end, and in pre-wrap CRLF became LF. A break before a run's first unit is a
// break before what the run became. A break before a later unit, as before a CR after a
// space, follows white space, so it is a break after what the run became. A mark without a
// break goes with its unit: Gecko's cluster start, which only a unit that stays text reads,
// and WebKit's forced break after a separator, which keeps its mark at the end too, also
// where the white space that ends the text starts at a break: at an item's edge in a
// paragraph, or after a lone CR the analysis took out, whose mark it took (RESEARCH.md,
// Decisions Log, 2026-10-07).
// Fills spaceSources, when given, in normal white space.
export function mapSourceLineBreaks(source: string, normalizedLength: number, sourceBreaks: Uint8Array, whiteSpace: WhiteSpaceMode, spaceSources: Uint16Array | null): Uint8Array {
  const breaks = new Uint8Array(normalizedLength + 1)
  let normalizedIndex = 0
  if (whiteSpace === 'pre-wrap') {
    for (let i = 0; i < source.length; i++, normalizedIndex++) {
      breaks[normalizedIndex] = sourceBreaks[i]!
      if (source.charCodeAt(i) === 0x0D && source.charCodeAt(i + 1) === 0x0A) {
        i++
        if ((sourceBreaks[i]! & BREAK) !== 0) breaks[normalizedIndex] = sourceBreaks[i]!
      }
    }
    breaks[normalizedLength] = sourceBreaks[source.length]!
    return breaks
  }
  let i = 0
  while (i < source.length && isCollapsibleSpaceCode(source.charCodeAt(i))) i++
  while (i < source.length) {
    let end = i + 1
    if (isCollapsibleSpaceCode(source.charCodeAt(i))) {
      while (end < source.length && isCollapsibleSpaceCode(source.charCodeAt(end))) end++
      if (end === source.length) break
    }
    if ((sourceBreaks[i]! & BREAK) === 0 && breaks[normalizedIndex] === 0) breaks[normalizedIndex] = sourceBreaks[i]!
    if (spaceSources !== null) spaceSources[normalizedIndex] = source.charCodeAt(i)
    const start = i
    for (; i < end; i++) {
      if ((sourceBreaks[i]! & BREAK) !== 0) breaks[i === start ? normalizedIndex : normalizedIndex + 1] = sourceBreaks[i]!
    }
    normalizedIndex++
  }
  breaks[normalizedLength] = (sourceBreaks[i]! & BREAK) === 0 ? sourceBreaks[i]! : sourceBreaks[i]! & FORCED_BREAK
  return breaks
}

// A FORCED_BREAK after U+2028 or U+2029 makes the separator a hard break in every white-space
// mode, and a SOFT_HYPHEN_BREAK makes a soft hyphen a zero-width break: the line can end there
// without a hyphen. One with only soft hyphens before it on its chunk stays a soft hyphen, since
// a zero-width break there holds a line and Firefox, which drops soft hyphens from its text runs,
// gives it none.
function classifySegmentUnit(normalized: string, breaks: Uint8Array, i: number, code: number, whiteSpace: WhiteSpaceMode, scan: AnalysisProfile['lineBreakScan']): SegmentKindCode {
  if ((code === 0x2028 || code === 0x2029) && (breaks[i + 1]! & FORCED_BREAK) !== 0) return HARD_BREAK
  if (code === 0x00AD && (breaks[i + 1]! & SOFT_HYPHEN_BREAK) !== 0 && followsChunkContent(normalized, i)) return ZERO_WIDTH_BREAK
  return classifySegmentBreakCode(code, whiteSpace, scan)
}

function followsChunkContent(normalized: string, i: number): boolean {
  let j = i - 1
  while (j >= 0 && normalized.charCodeAt(j) === 0x00AD) j--
  return j >= 0 && normalized.charCodeAt(j) !== 0x0A
}

// Characters of these kinds share a segment when no break falls between them. Each
// tab, hard break, ZWSP and NEL control stays its own segment.
function gathersKind(kind: number): boolean {
  return kind === TEXT || kind === SPACE || kind === PRESERVED_SPACE || kind === SOFT_HYPHEN
}

// A control character that stays its own text segment, measured alone: the C0 and C1
// controls that white-space normalization leaves as text, and the line and paragraph
// separators where they don't end a line.
function isControlSegmentCode(code: number): boolean {
  return code < 0x20 || (code >= 0x7F && code <= 0x9F) || code === 0x2028 || code === 0x2029
}

// Segments are the text between an engine's break opportunities, split where the
// break kind changes and where an item of a rich-inline paragraph starts (ITEM_START), and a
// control stays alone. A ZWSP or soft hyphen that the scan
// doesn't break after, as at the start of a WebKit scan, before a combining mark or a
// closing bracket, or under keep-all, is zero-width glue: it stays its own zero-width
// segment, takes no letter spacing and doesn't end a line.
// Combining marks right after it, or after a control, stay apart from the text after
// them, a segment of their own that measurement measures alone, as it does any text
// (ENGINE_FOLLOWUPS.md, Canvas answers that differ from the page). Where the Gecko
// scan marks cluster starts, a segment is ONE_CLUSTER unless one falls inside it.
//
// Firefox leaves soft hyphens and bidi controls out of the text run it breaks and maps a line end
// past the characters it left out (IsDiscardable, nsTextFrameUtils.cpp:32-49; nsTextFrame.cpp:
// 11161-11170), so a line ends after a run of them, never before one, and none starts with one
// after a wrap. Where the Gecko scan's text run left out a bidi control, a run of such characters
// with a control in it goes with the segment before it up to its last control: the scan finds no
// break inside the run and gives the one after it after the run. A soft hyphen after the last
// control keeps its break, and one before it offers none (GetHyphenationBreaks,
// nsTextFrame.cpp:4436-4442). A run that starts a chunk is a text segment that starts its line,
// with the text after it: Firefox trims no leading space there, since the content doesn't start
// with one (nsTextFrame.cpp:10935-10950), and the break the scan gives after the run, after a hard
// break or collapsed leading white space, can't end a line that holds nothing yet. A chunk of only
// such a run is no content of its own, so the hard break before it takes it (nsTextFrame.cpp:
// 11421-11429). After a control or marks that stay alone, the run starts a text segment. The
// profile's graphemes look past these characters (src/graphemes.ts), so a cluster extender after
// them joins the cluster before, and the text after them goes on in the segment as without them.
// A run of them ends where an item of a rich-inline paragraph starts inside it, and an item that
// starts with one starts a text segment with the text after it, as a chunk does, after the break
// the scan gives at the run, so its fragments keep the controls it starts with.
const flagUnbroken = (flags: number[], starts: number[], breaks: Uint8Array, hangTabs: boolean): boolean => {
  // A line ends only where the scan breaks, so the walkers learn where it doesn't:
  // before text, zero-width glue or a control, other than at a line start. A
  // ZWSP or soft hyphen there is zero-width glue. Before a space, tab or hard break
  // the scan has no break either, but the line can still end there, as they hang or
  // end it, so it keeps its kind. A tab that doesn't hang (EngineProfile's hangTabs) ends
  // no line before itself, nor do the spaces after it, which hang only where the run of
  // white space ends the line: Gecko breaks only after the whole run (nsLineBreaker.cpp:
  // 318-330). A soft hyphen before the tab keeps its break (GetHyphenationBreaks,
  // nsTextFrame.cpp:4409-4457).
  let hasUnbroken = false
  const count = flags.length
  for (let j = count - 2; j >= 0; j--) {
    const kind = flags[j]! & KIND_BITS
    const next = flags[j + 1]! & KIND_BITS
    if ((breaks[starts[j + 1]!]! & BREAK) !== 0 || kind === HARD_BREAK) continue
    if (!hangTabs && (next === TAB || (next === PRESERVED_SPACE && kind === TAB))) {
      if (kind === SOFT_HYPHEN) continue
    } else if (next === TEXT || next === ZERO_WIDTH_GLUE || next === CONTROL) {
      if (kind === ZERO_WIDTH_BREAK || kind === SOFT_HYPHEN) flags[j] = flags[j]! & ~KIND_BITS | ZERO_WIDTH_GLUE
    } else {
      continue
    }
    flags[j + 1] = flags[j + 1]! | UNBROKEN
    hasUnbroken = true
  }
  if (hasUnbroken) for (let j = 0; j < count; j++) if ((flags[j]! & UNBROKEN) === 0) flags[j] = flags[j]! | RETURNABLE
  return hasUnbroken
}

export function segmentAtLineBreaks(normalized: string, spaceSources: Uint16Array | null, breaks: Uint8Array, whiteSpace: WhiteSpaceMode, scan: AnalysisProfile['lineBreakScan'], hangTabs: boolean, dropsBidiControl: boolean): TextAnalysis {
  const oneCluster = scan === 'gecko' ? ONE_CLUSTER : 0
  const starts: number[] = []
  // A plain array, which measurement copies into the prepared handle's bytes: a Uint8Array for
  // each text slowed short texts' preparation (RESEARCH.md, Keeping Work Bounded).
  const flags: number[] = []
  let lastAlone = false
  let markRun = false
  // Where the last run of what the text run drops, handled at its start, ends.
  let droppedEnd = -1
  // The last segment's kind, -1 before the first unit, which starts one.
  let lastKind = -1
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i)
    if (dropsBidiControl && i < droppedEnd) continue
    if (dropsBidiControl && isDiscardable(code, false) && (i === 0 || (breaks[i]! & ITEM_START) !== 0 || !isDiscardable(normalized.charCodeAt(i - 1), false))) {
      // The run of what the text run drops from here, and where its last bidi control ends.
      let j = i
      let controlEnd = -1
      for (; j < normalized.length && isDiscardable(normalized.charCodeAt(j), false) && (j === i || (breaks[j]! & ITEM_START) === 0); j++) if (isBidiControl(normalized.charCodeAt(j))) controlEnd = j + 1
      if (controlEnd > 0) {
        const startsItem = lastKind >= 0 && lastKind !== HARD_BREAK && (breaks[i]! & ITEM_START) !== 0
        const chunkStart = lastKind < 0 || lastKind === HARD_BREAK || startsItem
        if (chunkStart) {
          const endsChunk = j === normalized.length || classifySegmentUnit(normalized, breaks, j, normalized.charCodeAt(j), whiteSpace, scan) === HARD_BREAK
          if (!endsChunk) {
            if (startsItem) breaks[i] = breaks[i]! | (breaks[j]! & BREAK)
            breaks[j] = breaks[j]! & ~(BREAK | SOFT_HYPHEN_BREAK)
          }
          droppedEnd = j
          if (endsChunk && lastKind >= 0) continue
        } else {
          droppedEnd = controlEnd
        }
        if (chunkStart || lastAlone || markRun) {
          starts.push(i)
          flags.push(TEXT | oneCluster)
          lastKind = TEXT
          lastAlone = false
          markRun = false
        }
        continue
      }
    }
    const kind = classifySegmentUnit(normalized, breaks, i, code, whiteSpace, scan)
    const alone = kind === TEXT && isControlSegmentCode(code)
    const unbroken = (breaks[i]! & BREAK) === 0
    if (
      (breaks[i]! & (BREAK | ITEM_START)) === 0 && !alone && !lastAlone && !(markRun && !combiningMarkRe.test(normalized[i]!)) &&
      kind === lastKind && gathersKind(kind)
    ) {
      if ((breaks[i]! & CLUSTER_START) !== 0) flags[flags.length - 1] = flags[flags.length - 1]! & ~ONE_CLUSTER
      continue
    }
    markRun = unbroken && kind === TEXT && combiningMarkRe.test(normalized[i]!) &&
      (lastAlone || lastKind === ZERO_WIDTH_BREAK || lastKind === SOFT_HYPHEN || lastKind === CONTROL)
    starts.push(i)
    flags.push(kind | oneCluster)
    lastKind = kind
    lastAlone = alone
  }
  const hasUnbroken = flagUnbroken(flags, starts, breaks, hangTabs)
  const count = flags.length
  // Each segment's text, sliced once here for measurement and the neighbours it reads: sliced
  // where measurement reads it, Firefox's rich-inline preparation ran 11-19% slower (RESEARCH.md,
  // Keeping Work Bounded).
  const texts: string[] = []
  for (let j = 0; j < count; j++) texts.push(normalized.slice(starts[j], j + 1 < count ? starts[j + 1] : normalized.length))
  return { normalized, spaceSources, texts, starts, flags, hasUnbroken }
}
