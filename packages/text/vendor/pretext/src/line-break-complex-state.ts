// State for the full line walker, which is private to a single walk.
import { PRESERVED_SPACE, TAB } from './analysis.js'
import { getEngineProfile } from './measurement.js'
import type { LayoutCursor } from './layout.js'
import type { ParagraphSegmentData, PreparedLineData } from './line-break-types.js'

function getWalkProfile(
  prepared: PreparedLineData,
  items: ParagraphSegmentData | undefined,
  maxWidth: number,
  discretionaryHyphenWidth: number,
) {
  const engineProfile = getEngineProfile()
  // Preserved spaces and tabs at the end of a line hang past it (CSS Text 3
  // §4.1.2), so they take no room when fitting and don't size the line (§8.2).
  // Gecko doesn't hang tabs.
  const hangingKinds = 1 << PRESERVED_SPACE | (engineProfile.hangTabs ? 1 << TAB : 0)
  // In Gecko a text frame's width leaves out its trailing spaces that overflow the line and
  // keeps those that fit, whatever follows the frame (EngineProfile, hangsSpacesPerTextFrame),
  // so in a rich-inline paragraph the run of preserved spaces that hang goes on, with what
  // overflows, past a segment that takes no room: an object of width 0, a soft hyphen or a
  // zero-width break, which the Gecko scan makes of a soft hyphen after white space.
  const hangGoesOnPastEmpty = items !== undefined && engineProfile.hangsSpacesPerTextFrame
  const testsHyphenBeforeAtomic = engineProfile.testsHyphenBeforeAtomic
  const zeroWidthGlueTakesLine = engineProfile.zeroWidthGlueTakesLine
  const tabsInAppUnits = engineProfile.tabsInAppUnits
  const paddedOpeningFit = engineProfile.paddedOpeningFit
  const hardBreakItemRetreat = engineProfile.hardBreakItemRetreat
  // A negative width lays out as 0, as in the simple stepper.
  const availableWidth = Math.max(0, maxWidth)
  const fitLimit = availableWidth + engineProfile.lineFitEpsilon
  // Preparation records soft-hyphen contexts only where the text has a soft hyphen.
  const retreatsFromUnfitHyphen = prepared.discretionaryHyphenContexts !== null
  // Blink's retry leaves room for the hyphen at every earlier opportunity. Gecko and
  // WebKit return to any opportunity whose line fits. A rich-inline paragraph has that room per
  // break (ParagraphSegmentData, hyphenRooms).
  const reservesHyphenWidth = engineProfile.unfitHyphenRetreat === 'reduced-width'
  const reservedHyphenWidth = reservesHyphenWidth ? discretionaryHyphenWidth : 0
  // WebKit's return stops at the line's first opportunity, whatever its hyphen overflows:
  // the soft hyphen the line reaches before any of its opportunities has fit, since one
  // without a hyphen fits where the text before it did.
  const keepsFirstBreak = retreatsFromUnfitHyphen && engineProfile.unfitHyphenRetreat === 'full-width-or-first'
  // Gecko's line keeps what the letters on the two sides of the soft hyphen it ends at
  // measure narrower joined. Blink shapes the line's end again, without it.
  const hyphenEndKeepsJoin = engineProfile.unfitHyphenRetreat === 'full-width'
  return {
    hangingKinds,
    hangGoesOnPastEmpty,
    testsHyphenBeforeAtomic,
    zeroWidthGlueTakesLine,
    tabsInAppUnits,
    paddedOpeningFit,
    hardBreakItemRetreat,
    availableWidth,
    fitLimit,
    retreatsFromUnfitHyphen,
    reservesHyphenWidth,
    reservedHyphenWidth,
    keepsFirstBreak,
    hyphenEndKeepsJoin,
  }
}

function initialLineState() {
  return {
    lineStartSegmentIndex: 0,
    lineStartGraphemeIndex: 0,
    lineW: 0,
    hasContent: false,
    lineEndSegmentIndex: 0,
    lineEndGraphemeIndex: 0,
    pendingBreakSegmentIndex: 0,
    pendingBreakWidth: 0,
    fitBreakSegmentIndex: 0,
    fitBreakPaintWidth: 0,
    hangEndSegmentIndex: 0,
    hangStartWidth: 0,
    hangStays: false,
    hangEdgesWidth: 0,
    lineEndTrimmed: 0,
    zeroWidthPrefix: false,
    afterUnspacedControl: false,
    endSegmentIndex: 0,
    endGraphemeIndex: 0,
    endWidth: 0,
    returnsFromHyphen: false,
    lineWidth: null as number | null,
  }
}

function initialSegmentState() {
  return {
    fillStart: 0,
    fillSpacing: 0,
    flags: 0,
    kind: 0,
    spaced: false,
    breakAfter: false,
    startGraphemeIndex: 0,
    gap: 0,
    leadingSpacing: 0,
    w: 0,
    advance: 0,
    endTrim: 0,
    fitAdvance: 0,
    hangs: false,
  }
}

export function makeWalkState(prepared: PreparedLineData, cursor: LayoutCursor, maxWidth: number) {
  const {
    widths,
    segmentFlags,
    breakableFitAdvances,
    discretionaryHyphenWidth,
    letterSpacing,
    lineStartExtras,
    lineEndTrims,
    overflowLineEndTrims,
    tabStopAdvance,
    minimumTabAdvance,
  } = prepared
  const segmentCount = widths.length
  const items = prepared.items
  const hyphenWidths = items === undefined ? null : items.hyphenWidths
  const hyphenRooms = items === undefined ? null : items.hyphenRooms
  const itemEndHalts = items === undefined ? null : items.itemEndHalts
  const insideExtras = items === undefined ? null : items.insideExtras
  const fillExtras = items === undefined ? null : items.fillExtras
  const openingEdges = items === undefined ? null : items.openingEdges
  const emptyObjectSpaces = items === undefined ? null : items.emptyObjectSpaces
  const emptyObjectReturns = items === undefined ? null : items.emptyObjectReturns
  const profile = getWalkProfile(prepared, items, maxWidth, discretionaryHyphenWidth)
  return {
    prepared,
    cursor,
    widths,
    segmentFlags,
    breakableFitAdvances,
    discretionaryHyphenWidth,
    letterSpacing,
    lineStartExtras,
    lineEndTrims,
    overflowLineEndTrims,
    tabStopAdvance,
    minimumTabAdvance,
    segmentCount,
    items,
    hyphenWidths,
    hyphenRooms,
    itemEndHalts,
    insideExtras,
    fillExtras,
    openingEdges,
    emptyObjectSpaces,
    emptyObjectReturns,
    ...profile,
    ...initialLineState(),
    ...initialSegmentState(),
  }
}

export type ComplexWalkState = ReturnType<typeof makeWalkState>
