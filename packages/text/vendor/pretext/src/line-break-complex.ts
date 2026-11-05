// The full line walker, split into its scan and line-ending operations.
import {
  CONTROL, HARD_BREAK, KIND_BITS, OBJECT, PRESERVED_SPACE, RETURNABLE, SOFT_HYPHEN,
  SPACE, SPACED, TAB, TEXT, UNBROKEN, ZERO_WIDTH_BREAK, ZERO_WIDTH_GLUE,
} from './analysis.js'
import { BREAK_AFTER_KINDS, breaksAfterKind } from './line-break-simple.js'
import { isDiscretionaryLineEnd, getTabAdvance, getItemTabAdvance, normalizePreparedLineStart } from './line-break-geometry.js'
import { makeWalkState, type ComplexWalkState } from './line-break-complex-state.js'
import type { PreparedLineData, InternalLineVisitor } from './line-break-types.js'
import type { LayoutCursor, LineStats } from './layout.js'

function getTerminalLetterSpacing(
  prepared: PreparedLineData,
  openingEdges: number[] | null,
  hangingKinds: number,
  startSegmentIndex: number,
  startGraphemeIndex: number,
  endSegmentIndex: number,
  endGraphemeIndex: number,
): number {
  const { letterSpacing, segmentFlags } = prepared
  if (letterSpacing === 0) return 0

  if (endGraphemeIndex > 0) return (segmentFlags[endSegmentIndex]! & SPACED) !== 0 ? letterSpacing : 0

  const segmentCount = prepared.widths.length
  if (isDiscretionaryLineEnd(segmentFlags, segmentCount, endSegmentIndex, endGraphemeIndex)) return 0
  // A run of preserved spaces and tabs that hangs where the line wraps already
  // charged the gap after the glyph before it. Gecko doesn't hang tabs.
  if (endSegmentIndex > startSegmentIndex && endSegmentIndex < segmentCount && (segmentFlags[endSegmentIndex]! & KIND_BITS) !== HARD_BREAK &&
    (1 << (segmentFlags[endSegmentIndex - 1]! & KIND_BITS) & hangingKinds) !== 0) return 0

  for (let i = endSegmentIndex - 1; i >= startSegmentIndex; i--) {
    const flags = segmentFlags[i]!
    const kind = flags & KIND_BITS
    // Segments that take no letter spacing, such as zero-width glue or marks
    // shaped on the grapheme before them, leave that grapheme's gap last. A tab
    // that takes none follows that gap, which its stop counts from. An object
    // leaves none after itself, nor does the edge of a padded opening.
    if (kind === SPACE || (kind !== CONTROL && kind !== TAB && (flags & SPACED) === 0 && kind !== OBJECT && (openingEdges === null || openingEdges[i]! === 0))) continue

    if (i === startSegmentIndex && startGraphemeIndex > 0) return letterSpacing

    return (flags & SPACED) !== 0 ? letterSpacing : 0
  }

  return 0
}

// Whether the run of preserved spaces and tabs that hang, which starts at segment `start` right
// after an object on its line, an atomic rich-inline item or a box (OBJECT), stays there however
// far the line overflows, as no break comes before it in the text (UAX #14 LB7). Blink takes it
// as trailing items after the break after an atomic inline (HandleTrailingSpaces,
// line_breaker.cc:2426-2534), trailing on into the next item where an item's spaces reach its end
// (:2518-2533); WebKit gives a soft wrap opportunity after each white-space item
// (isAtSoftWrapOpportunity, InlineFormattingUtils.cpp:408-413) and keeps each as content that hangs
// (InlineContentBreaker.cpp:181-182); and Gecko lets an empty frame past the line's end
// (CanPlaceFrame, nsLineLayout.cpp:1217-1270). After text that overflows, the engine's retry
// between graphemes breaks before the white space instead. But Gecko breaks only after a run of
// spaces and tabs (nsLineBreaker.cpp:323, :586) and doesn't hang a tab, so where the white space
// runs into a tab, Firefox moves all of it to the next line with the tab. The walker asks once
// per run, so a long run costs one pass.
function staysAfterObject(segmentFlags: Uint8Array, segmentCount: number, start: number, hangingKinds: number): boolean {
  let after = start + 1
  while (after < segmentCount && (1 << (segmentFlags[after]! & KIND_BITS) & hangingKinds) !== 0) after++
  return after === segmentCount || (segmentFlags[after]! & KIND_BITS) !== TAB
}

// Whether a line that would end at the break before `breakSegmentIndex`, painting
// `breakWidth`, returns to an earlier opportunity: where it ends at a selected
// discretionary hyphen that doesn't fit. A return needs an overflow that isolated
// widths can show: the soft hyphens on the line may measure narrower joined than apart
// by less than the overflow. Those are the soft hyphens the line passes, whose text the
// engine shapes whole, and with `endKeepsJoin` the one the line ends at too
// (EngineProfile, unfitHyphenRetreat).
function returnsFromUnfitHyphen(
  prepared: PreparedLineData,
  lineStartSegmentIndex: number,
  breakSegmentIndex: number,
  breakWidth: number,
  fitLimit: number,
  endKeepsJoin: boolean,
): boolean {
  const { discretionaryHyphenContexts, segmentFlags } = prepared
  const softHyphenIndex = breakSegmentIndex - 1
  if (softHyphenIndex < lineStartSegmentIndex || (segmentFlags[softHyphenIndex]! & KIND_BITS) !== SOFT_HYPHEN || breakWidth <= fitLimit) return false
  const overflow = breakWidth - fitLimit
  let narrowing = 0
  const last = endKeepsJoin ? softHyphenIndex : softHyphenIndex - 1
  if (discretionaryHyphenContexts !== null) for (let i = lineStartSegmentIndex; i <= last; i++) narrowing += discretionaryHyphenContexts[i]!
  return narrowing < overflow
}

function recordSoftHyphen(state: ComplexWalkState, i: number): void {
  if (state.hasContent) {
    // The hyphen a line that ends here paints, and whether it has to fit. What only a
    // rich-inline paragraph has is under one test, which is all a text's soft hyphen
    // pays for it (RESEARCH.md, Keeping Work Bounded).
    let hyphenWidth = state.discretionaryHyphenWidth
    let fitsHyphen = true
    if (state.items !== undefined) {
      // A break comes after an object, so a line returns to it from a soft hyphen right
      // after the object whose hyphen doesn't fit: Chrome, Firefox and Safari break
      // there with the hyphen where it fits, and else after the object.
      if (state.retreatsFromUnfitHyphen && i > state.lineStartSegmentIndex && (state.segmentFlags[i - 1]! & KIND_BITS) === OBJECT) {
        state.fitBreakSegmentIndex = i
        state.fitBreakPaintWidth = state.lineW
      }
      if (state.hangGoesOnPastEmpty && state.hangEndSegmentIndex === i) {
        state.hangEndSegmentIndex = i + 1
        state.hangStartWidth = Math.max(state.hangStartWidth, Math.min(state.lineW, state.availableWidth))
      }
      if (state.hyphenWidths !== null) hyphenWidth = state.hyphenWidths[i]!
      // A soft hyphen's fit includes its own hyphen, but for one right before an atomic
      // item where the engine never tests that hyphen (EngineProfile).
      fitsHyphen = state.testsHyphenBeforeAtomic || i + 1 === state.segmentCount || (state.segmentFlags[i + 1]! & KIND_BITS) !== OBJECT || (state.openingEdges !== null && state.openingEdges[i + 1]! !== 0)
    }
    state.lineEndSegmentIndex = i + 1
    state.lineEndGraphemeIndex = 0
    if (i + 1 < state.segmentCount && (state.segmentFlags[i + 1]! & KIND_BITS) !== HARD_BREAK) {
      state.pendingBreakSegmentIndex = i + 1
      state.pendingBreakWidth = state.lineW + hyphenWidth
      if (state.retreatsFromUnfitHyphen && ((fitsHyphen ? state.pendingBreakWidth : state.lineW) <= state.fitLimit || (state.keepsFirstBreak && state.fitBreakSegmentIndex < 0))) {
        state.fitBreakSegmentIndex = state.pendingBreakSegmentIndex
        state.fitBreakPaintWidth = state.pendingBreakWidth
      }
    }
  }
}

function initializeComplexSegment(state: ComplexWalkState, i: number): boolean {
  state.fillStart = 0
  state.fillSpacing = 0
  state.flags = state.segmentFlags[i]!
  state.kind = state.flags & KIND_BITS
  if (state.kind === HARD_BREAK) return true
  state.spaced = (state.flags & SPACED) !== 0
  state.breakAfter = (1 << state.kind & BREAK_AFTER_KINDS) !== 0
  state.startGraphemeIndex = i === state.lineStartSegmentIndex ? state.lineStartGraphemeIndex : 0
  // The gap before a segment belongs to the grapheme before it. A control or
  // a tab that takes no letter spacing still follows that gap but adds none
  // after itself, and so does an object, which is no character (CSS Text 3,
  // letter-spacing), as is the edge of a padded opening that hangs as white
  // space; other segments that take none leave it as it was.
  state.gap = state.letterSpacing !== 0 && state.hasContent && !state.zeroWidthPrefix && !state.afterUnspacedControl ? state.letterSpacing : 0
  state.leadingSpacing = 0
  if (state.letterSpacing !== 0 && (state.spaced || state.kind === CONTROL || state.kind === TAB || state.kind === OBJECT || (state.openingEdges !== null && state.openingEdges[i]! !== 0))) {
    state.leadingSpacing = state.gap
    state.afterUnspacedControl = !state.spaced
  }
  if (state.kind !== ZERO_WIDTH_BREAK && state.kind !== ZERO_WIDTH_GLUE) state.zeroWidthPrefix = false
  state.w = state.kind !== TAB ? state.widths[i]!
    : state.items === undefined ? getTabAdvance(state.lineW + state.leadingSpacing, state.tabStopAdvance, state.minimumTabAdvance, state.tabsInAppUnits)
    : getItemTabAdvance(state.prepared, state.items, i, state.hasContent ? state.lineW + state.leadingSpacing : state.lineStartExtras === null ? 0 : state.lineStartExtras[i]!, state.tabsInAppUnits)
  state.advance = state.leadingSpacing + state.w
  state.endTrim = state.lineEndTrims === null ? 0 : state.lineEndTrims[i]!
  return false
}

function measureComplexFit(state: ComplexWalkState, i: number): void {
  state.fitAdvance = 0
  if (state.letterSpacing !== 0 && !state.spaced && !state.breakAfter && state.kind !== CONTROL) {
    state.fitAdvance = state.gap + state.w
  } else if (state.breakAfter ? state.kind === TAB : state.w !== 0 || state.kind === CONTROL) {
    const contribution = state.w + (state.spaced ? state.letterSpacing : 0)
    if (contribution !== 0) state.fitAdvance = state.leadingSpacing + contribution
  }
  // Two statements, for how the engines compile them: with them Safari 27 laid pre-wrap text
  // out 4.3% faster than with the same tests as one `||` and Chrome 154 letter-spaced CJK
  // text 2.8%, and Firefox 156 read within 1.5% either way (RESEARCH.md, Keeping Work
  // Bounded, Work Done Only Where A Rule Applies; Decisions Log, 2026-10-08).
  state.hangs = (1 << state.kind & state.hangingKinds) !== 0
  if (state.hangGoesOnPastEmpty && state.kind === ZERO_WIDTH_BREAK && state.hangEndSegmentIndex === i) state.hangs = true
  if (state.hangs) {
    if (state.hangEndSegmentIndex !== i) {
      state.hangStartWidth = state.lineW - state.lineEndTrimmed + state.leadingSpacing
      state.hangStays = false
      if (state.items !== undefined && i > state.lineStartSegmentIndex && (state.segmentFlags[i - 1]! & KIND_BITS) === OBJECT) {
        state.hangStays = staysAfterObject(state.segmentFlags, state.segmentCount, i, state.hangingKinds)
        // A run that goes down with its tab leaves from the break after the object.
        if (!state.hangStays) {
          state.pendingBreakSegmentIndex = i
          state.pendingBreakWidth = state.lineW - state.lineEndTrimmed
        }
      }
      state.hangEdgesWidth = 0
    }
    state.hangEndSegmentIndex = i + 1
    if (state.openingEdges !== null) {
      state.hangStartWidth += state.openingEdges[i]!
      state.hangEdgesWidth += state.openingEdges[i]!
    }
  }
}

function admitFirstSegment(state: ComplexWalkState, i: number): boolean {
  if (state.startGraphemeIndex > 0) {
    state.fillStart = state.startGraphemeIndex
  } else {
    const startExtra = state.lineStartExtras === null ? 0 : state.lineStartExtras[i]!
    // With no break before it on the line, an overflowing segment is laid out
    // by Blink's retry between graphemes, which halts where that lets it fit.
    const startTrim = state.overflowLineEndTrims !== null && state.fitAdvance + startExtra - state.overflowLineEndTrims[i]! <= state.fitLimit
    ? state.overflowLineEndTrims[i]!
    : state.endTrim
    // Preserved spaces hang whole, with the advances rich inline gives them too
    // (hardBreakItemRetreat).
    if (state.fitAdvance + startExtra - startTrim > state.fitLimit && state.breakableFitAdvances[i] !== null && !state.hangs) {
      state.fillStart = 0
    } else {
      state.hasContent = true
      state.lineEndSegmentIndex = i + 1
      state.lineEndGraphemeIndex = 0
      state.lineW = state.w + startExtra
      // What the line pays at its start stays where the white space it starts with hangs.
      if (state.hangs) state.hangStartWidth += startExtra
      state.lineEndTrimmed = state.fitAdvance + startExtra > state.fitLimit && state.kind !== OBJECT ? startTrim : 0
      // A mark halted at its item's end stays halted where the line goes on (below).
      if (state.itemEndHalts !== null && state.lineEndTrimmed !== 0 && state.itemEndHalts[i]! !== 0) {
        state.lineW -= state.lineEndTrimmed
        state.lineEndTrimmed = 0
      }
      // The break segment hangs with the gap before it, a run of preserved
      // spaces and tabs hangs whole, and a tab that doesn't hang counts whole.
      if (state.breakAfter && (i + 1 === state.segmentCount || (state.segmentFlags[i + 1]! & UNBROKEN) === 0)) {
        state.pendingBreakSegmentIndex = i + 1
        state.pendingBreakWidth = state.hangs ? state.hangStartWidth : state.kind === TAB ? state.lineW : state.lineW - state.advance
      }
      if (state.retreatsFromUnfitHyphen && state.breakAfter && state.pendingBreakWidth + (state.hyphenRooms === null || state.pendingBreakSegmentIndex < 0 ? state.reservedHyphenWidth : state.hyphenRooms[state.pendingBreakSegmentIndex]!) <= state.fitLimit) {
        state.fitBreakSegmentIndex = state.pendingBreakSegmentIndex
        state.fitBreakPaintWidth = state.pendingBreakWidth
      }
      return true
    }
  }

  return false
}

function recordFittingSegment(state: ComplexWalkState, i: number, newFitW: number): number {
  // A break the scan gives before text is one the line can return to.
  if ((state.flags & RETURNABLE) !== 0 && !state.breakAfter && state.pendingBreakSegmentIndex !== i) {
    state.pendingBreakSegmentIndex = i
    state.pendingBreakWidth = state.lineW
  }
  // A break the scan gives between two text segments, as after `-` or between
  // ideographs, is an opportunity the line returns to like any other. The line up
  // to it fit when its last segment was admitted, with the letter-spacing gap after
  // it that lineW leaves out, so only Blink's room for the hyphen is tested here.
  if (state.retreatsFromUnfitHyphen && !state.breakAfter && (state.flags & UNBROKEN) === 0 && i > state.lineStartSegmentIndex &&
    !breaksAfterKind(state.segmentFlags[i - 1]! & KIND_BITS) && (!state.reservesHyphenWidth || state.lineW + (state.hyphenRooms === null ? state.discretionaryHyphenWidth : state.hyphenRooms[i]!) <= state.fitLimit)) {
    state.fitBreakSegmentIndex = i
    state.fitBreakPaintWidth = state.lineW
  }
  state.lineEndSegmentIndex = i + 1
  state.lineEndGraphemeIndex = 0
  if (state.itemEndHalts !== null && newFitW > state.fitLimit && state.itemEndHalts[i]! !== 0) {
    // A closing mark that ends its item and fits the line only halted stays halted where
    // the line goes on: the line takes it at its halted width, and what follows fits
    // after that (ParagraphSegmentData, itemEndHalts).
    state.lineW += state.advance - state.endTrim
    state.lineEndTrimmed = 0
  } else {
    state.lineW += state.advance
    // A segment that takes no room at the line end, as a space, leaves the glyph
    // before it last on the line, with its trim.
    if (state.fitAdvance !== 0 && !state.hangs) state.lineEndTrimmed = newFitW > state.fitLimit && state.kind !== OBJECT ? state.endTrim : 0
  }
  if (state.breakAfter && (i + 1 === state.segmentCount || (state.segmentFlags[i + 1]! & UNBROKEN) === 0)) {
    state.pendingBreakSegmentIndex = i + 1
    state.pendingBreakWidth = state.hangs ? state.hangStartWidth : state.kind === TAB ? state.lineW : state.lineW - state.advance - state.lineEndTrimmed
  }
  if (state.retreatsFromUnfitHyphen && state.breakAfter && state.pendingBreakWidth + (state.hyphenRooms === null || state.pendingBreakSegmentIndex < 0 ? state.reservedHyphenWidth : state.hyphenRooms[state.pendingBreakSegmentIndex]!) <= state.fitLimit) {
    state.fitBreakSegmentIndex = state.pendingBreakSegmentIndex
    state.fitBreakPaintWidth = state.pendingBreakWidth
  }
  return -2

}

function segmentOverflows(state: ComplexWalkState, i: number, newFitW: number): boolean {
  let overflows = newFitW - state.endTrim > state.fitLimit
  if (state.items !== undefined) {
    // Blink and WebKit move an object of width 0 that doesn't fit to the next line as any
    // other. Gecko places an empty frame though it sticks out of the line (CanPlaceFrame,
    // nsLineLayout.cpp:1264-1269; EngineProfile, emptyAtomicAlwaysFits). It sticks out
    // where the content before it ends past the line's end, with the collapsed space
    // before the object, which a line end trims no more once the object follows it
    // (nsLineLayout.cpp:1017-1020), and without the preserved spaces that hang, which
    // end at the line's end (nsTextFrame.cpp:11216-11229). The line then ends before it
    // where the text before it ends in white space and its last frame ends past the
    // line's end without that frame's own spaces, as the line breaks after the white
    // space (nsTextFrame.cpp:11443-11456), and where a break comes before the object
    // and what follows it sends the line back there (ParagraphSegmentData).
    let placesEmptyObject = false
    if (state.emptyObjectSpaces !== null && state.kind === OBJECT && state.w === 0 && newFitW > state.fitLimit) {
      const contentW = state.hangEndSegmentIndex === i ? state.hangStartWidth : state.lineW
      const space = state.emptyObjectSpaces[i]!
      placesEmptyObject = contentW <= state.fitLimit || !((space >= 0 && contentW - space > state.fitLimit) || state.emptyObjectReturns![i] === 1)
    }
    // No engine lets content make a line narrower (findWholeLine in src/rich-inline.ts),
    // so a segment of less than no advance, as a letter under a letter spacing more
    // negative than it is wide, doesn't bring a line that overflows back.
    const narrowsOverflow = state.fitAdvance < 0 && state.lineW - state.lineEndTrimmed > state.fitLimit
    overflows = (overflows || narrowsOverflow) && !(state.hangs && state.hangStays) && !placesEmptyObject
    if (state.hangGoesOnPastEmpty && !overflows && state.hangEndSegmentIndex === i && state.kind === OBJECT && state.w === 0) {
      state.hangEndSegmentIndex = i + 1
      state.hangStartWidth = Math.max(state.hangStartWidth, Math.min(state.lineW + state.advance, state.availableWidth))
    }
  }
  return overflows
}

function retreatBeforeHardBreak(state: ComplexWalkState, i: number): number {
  if (state.kind === OBJECT && state.hardBreakItemRetreat !== 'item' && i + 1 < state.segmentCount && (state.segmentFlags[i + 1]! & KIND_BITS) === HARD_BREAK) {
    const beforeFlags = state.segmentFlags[i - 1]!
    const beforeKind = beforeFlags & KIND_BITS
    const spaceAdvances = beforeKind === PRESERVED_SPACE ? state.breakableFitAdvances[i - 1]! : null
    if (spaceAdvances !== null) {
      const count = spaceAdvances.length
      const spaceAdvance = spaceAdvances[0]!
      const moved = state.hardBreakItemRetreat !== 'fit' || state.lineW <= state.fitLimit ? 1 : spaceAdvance > 0 ? Math.min(count, Math.ceil((state.lineW - state.fitLimit) / spaceAdvance)) : count
      // The start edge of the spaces' own item is no content to leave on the line.
      const contentStart = state.openingEdges !== null && state.openingEdges[state.lineStartSegmentIndex]! !== 0 ? state.lineStartSegmentIndex + 1 : state.lineStartSegmentIndex
      if (i - 1 > contentStart || count - moved > state.lineStartGraphemeIndex) {
        state.endSegmentIndex = i - 1
        state.endGraphemeIndex = count - moved
        state.endWidth = state.hangStartWidth
        return -1
      }
    }
    const beforeAdvances = beforeKind === TEXT || beforeKind === CONTROL ? state.breakableFitAdvances[i - 1]! : null
    const spacing = (beforeFlags & SPACED) !== 0 ? state.letterSpacing : 0
    if (beforeAdvances !== null && (i - 1 > state.lineStartSegmentIndex || beforeAdvances.length - 1 > state.lineStartGraphemeIndex)) {
      state.endSegmentIndex = i - 1
      state.endGraphemeIndex = beforeAdvances.length - 1
      state.endWidth = state.lineW - beforeAdvances[state.endGraphemeIndex]! - spacing
      return -1
    }
    if (beforeAdvances === null && (beforeKind === TEXT || beforeKind === CONTROL) && i - 1 > state.lineStartSegmentIndex) {
      state.endSegmentIndex = i - 1
      state.endGraphemeIndex = 0
      state.endWidth = state.lineW - state.widths[i - 1]! - spacing
      return -1
    }
    if (spaceAdvances !== null || (beforeKind !== PRESERVED_SPACE && beforeKind !== TAB)) {
      state.lineW += state.advance
      state.lineEndSegmentIndex = i + 1
      state.lineEndGraphemeIndex = 0
      state.lineEndTrimmed = 0
      return -2
    }
  }
  return 0
}

function finishHangingOverflow(state: ComplexWalkState, i: number): boolean {
  // A break segment hangs with the gap before it, after the content before
  // it, which fits without its line-end trim. A collapsible space or ZWSP
  // hangs even after overflowing content that started the line, as the
  // simple stepper does; a preserved space there starts the next line. A
  // tab that doesn't hang goes to the next line, as text does. A ZWSP also
  // hangs right after an object, as after the start edge of its item's opening,
  // which the line took by the part it fits; after a chip wider than the line
  // that is Firefox's line, where Chrome and Safari give a ZWSP that ends the
  // paragraph a line of its own (ENGINE_FOLLOWUPS.md, Rich-inline item edges).
  const contentW = state.lineW - state.lineEndTrimmed
  if (state.breakAfter && (state.hangs || state.kind !== TAB) && (contentW <= state.fitLimit ||
      (state.pendingBreakSegmentIndex < 0 && (state.kind === SPACE || state.kind === ZERO_WIDTH_BREAK)) ||
      (state.kind === ZERO_WIDTH_BREAK && (state.segmentFlags[i - 1]! & KIND_BITS) === OBJECT))) {
    state.endWidth = state.hangs ? state.hangStartWidth : contentW
    state.lineW += state.advance
    state.endSegmentIndex = i + 1
    state.endGraphemeIndex = 0
    return true
  }
  // Gecko's line returns from a tab that doesn't fit to its latest break (below), as
  // BreakAndMeasureText keeps the last break whose line fits (gfxTextRun.cpp:1086-1101).
  // Without one it wraps before the tab, as break-word lets it before any cluster
  // (:1069-1072), and the spaces before the tab hang.
  if (state.kind === TAB && !state.hangs && state.pendingBreakSegmentIndex < 0) {
    state.endSegmentIndex = i
    state.endGraphemeIndex = 0
    state.endWidth = state.hangEndSegmentIndex === i && i > state.lineStartSegmentIndex ? state.hangStartWidth : contentW
    return true
  }


  return false
}

function admitFollowingSegment(state: ComplexWalkState, i: number): number {
  // A run of preserved spaces and tabs fits where the text before it fits, and after an
  // object however far the line overflows (staysAfterObject).
  const newFitW = state.hangs ? state.hangStartWidth - state.hangEdgesWidth : state.lineW + state.fitAdvance
  // Whether the segment ends the line. What only a rich-inline paragraph has is under one
  // test, as at a soft hyphen (above).
  const overflows = segmentOverflows(state, i, newFitW)
  if (overflows) {
    if (finishHangingOverflow(state, i)) return -1

    const unbroken = (state.flags & UNBROKEN) !== 0
    // An object with no break before it is the start edge of a padded rich-inline
    // item's opening (src/rich-inline.ts). Blink's line trails once the preserved
    // spaces it ends with overflow: it takes the white space after them, the tags of
    // spans that open among it and a forced break with no fit (HandleTrailingSpaces,
    // line_breaker.cc:2426-2534), so an edge right after such a run joins it, taking
    // no room. The spaces overflow where the content before them fits with the start
    // edges of the spans that open among them, half of each such edge (getOpeningFit),
    // and the spaces after those edges don't; an overflow before the spaces or at a
    // span's end edge returns instead. WebKit fits the content it places without the
    // white space that hangs before it (hangingContentWidth,
    // InlineContentBreaker.cpp:183-186), so there the edge joins the run where it fits
    // after the content before the run.
    if (state.kind === OBJECT && unbroken && state.hangEndSegmentIndex === i && (state.paddedOpeningFit === 'start'
        ? state.hangStartWidth - state.hangEdgesWidth / 2 <= state.fitLimit && state.lineW - state.hangEdgesWidth / 2 > state.fitLimit
        : state.paddedOpeningFit === 'placed' && state.hangStartWidth - state.hangEdgesWidth + state.w - state.endTrim <= state.fitLimit)) {
      state.hangEndSegmentIndex = i + 1
      state.hangStartWidth += state.w
      state.hangEdgesWidth += state.w
      state.lineW += state.advance
      state.lineEndSegmentIndex = i + 1
      state.lineEndGraphemeIndex = 0
      return -2
    }
    // Where the scan gives no break before the segment, as before NEL (UAX #14
    // LB6), the line returns to its last break. Without one, Blink and WebKit retry
    // between graphemes, so the segment's graphemes fill it.
    if (unbroken && state.pendingBreakSegmentIndex >= 0) {
      state.lineEndSegmentIndex = state.pendingBreakSegmentIndex
      state.lineEndGraphemeIndex = 0
    }
    if (!unbroken || state.pendingBreakSegmentIndex >= 0) {
      state.returnsFromHyphen = true
      return -1
    }
    // Blink's retry halts the segment where that lets it fit, and the line ends after it,
    // but where the segment ends its item, whose mark stays halted while the line goes on.
    if (state.overflowLineEndTrims !== null && newFitW - state.overflowLineEndTrims[i]! <= state.fitLimit) {
      state.lineW += state.advance
      state.lineEndSegmentIndex = i + 1
      state.lineEndGraphemeIndex = 0
      state.lineEndTrimmed = state.overflowLineEndTrims[i]!
      if (state.itemEndHalts !== null && state.itemEndHalts[i]! !== 0) {
        state.lineW -= state.lineEndTrimmed
        state.lineEndTrimmed = 0
      }
      return -2
    }
    // Where the line of such an edge has no break to return to, the line ends before
    // it, but before a hard break only in Blink, whose retry breaks between any two
    // graphemes: WebKit and Gecko end the line before the last grapheme of the text
    // before the edge, and keep the edge on a line that grapheme starts (EngineProfile,
    // hardBreakItemRetreat). Of preserved spaces there, whose advances rich inline
    // gives, Gecko moves the last and WebKit those that don't fit: all of them where a
    // negative letter spacing leaves a space no advance, so that giving one up gives no
    // overflow back. The ones the line keeps hang.
    const hardBreak = retreatBeforeHardBreak(state, i)
    if (hardBreak !== 0) return hardBreak
    if (state.breakableFitAdvances[i] === null) {
      state.returnsFromHyphen = true
      return -1
    }
    state.fillStart = 0
    state.fillSpacing = state.leadingSpacing
  } else {
    return recordFittingSegment(state, i, newFitW)
  }

  return 0
}

function scanComplexSegment(state: ComplexWalkState, i: number): number {
  if (i >= state.segmentCount) return state.segmentCount
  // The graphemes of segment i from fillStart go on the line one by one, after
  // the gap fillSpacing.
  if (initializeComplexSegment(state, i)) return i + 1

  if (state.kind === SOFT_HYPHEN && state.startGraphemeIndex === 0) {
    recordSoftHyphen(state, i)
    return -2
  }

  // A line that ends after a whole segment charges its advance and the letter
  // spacing gap after it. Spaces and zero-width breaks hang, and zero-width
  // text owns no gap, though NEL does. Text that takes no letter spacing, such
  // as zero-width glue, fits like the line that still ends with the gap before it.
  measureComplexFit(state, i)
  // Where glue can't hold a line, glue at a line start isn't the line's content:
  // the segment after it starts the line, however wide.
  if (!state.hasContent && state.kind === ZERO_WIDTH_GLUE && !state.zeroWidthGlueTakesLine) {
    state.lineEndSegmentIndex = i + 1
    state.lineEndGraphemeIndex = 0
    return -2
  }

  // A fresh line and a line with content admit a whole segment apart, each
  // with its own copy of what follows admission. One path for both, testing
  // at each step whether the line has content, laid out short lines 3 to 17%
  // slower in all three browsers (RESEARCH.md, Keeping Work Bounded).
  if (!state.hasContent) {
    if (admitFirstSegment(state, i)) return -2
  } else {
    const result = admitFollowingSegment(state, i)
    if (result !== 0) return result
  }

  // A grapheme fits with the letter spacing after it.
  const fitAdvances = state.breakableFitAdvances[i]!
  const fitCount = fitAdvances.length
  for (let g = state.fillStart; g < fitCount; g++) {
    const baseGw = fitAdvances[g]!
    if (!state.hasContent) {
      state.hasContent = true
      state.lineEndSegmentIndex = i
      state.lineEndGraphemeIndex = g + 1
      const startExtras = state.prepared.breakableLineStartExtras?.[i] ?? null
      state.lineW = startExtras === null ? baseGw : baseGw + startExtras[g]!
      // A line that starts inside a padded rich-inline item, or fills its first
      // segment, pays the item's extraWidth (ParagraphSegmentData).
      if (g > 0 ? state.insideExtras !== null : state.fillExtras !== null) state.lineW += g > 0 ? state.insideExtras![i]! : state.fillExtras![i]!
    } else {
      const candidatePaintWidth = state.lineW + (baseGw + (g > state.fillStart ? state.letterSpacing : state.fillSpacing))
      if (candidatePaintWidth + state.letterSpacing > state.fitLimit) return -1
      state.lineW = candidatePaintWidth
      state.lineEndSegmentIndex = i
      state.lineEndGraphemeIndex = g + 1
    }
  }
  if (state.hasContent && state.lineEndSegmentIndex === i && state.lineEndGraphemeIndex === fitCount) {
    state.lineEndSegmentIndex = i + 1
    state.lineEndGraphemeIndex = 0
  }

  return -2
}

function decideComplexLine(state: ComplexWalkState): void {
  decided: {
    // Where the line ends when its source runs out: after the chunk's hard
    // break, or at the end of the text.
    let consumedEndSegmentIndex: number
    for (let i = state.lineStartSegmentIndex; ; i++) {
      const result = scanComplexSegment(state, i)
      if (result === -1) break decided
      if (result >= 0) {
        consumedEndSegmentIndex = result
        break
      }
    }

    // A line that ends where its source runs out at an unfit selected hyphen
    // returns as well.
    state.endSegmentIndex = consumedEndSegmentIndex
    state.endGraphemeIndex = 0
    if (state.pendingBreakSegmentIndex === consumedEndSegmentIndex && state.lineEndGraphemeIndex === 0) {
      state.endWidth = state.pendingBreakWidth
      state.returnsFromHyphen = true
    } else {
      state.endWidth = state.lineW - state.lineEndTrimmed
    }
  }
}

function finishComplexLine(state: ComplexWalkState): void {
  if (state.hasContent) {
    if (
      state.returnsFromHyphen &&
      state.fitBreakSegmentIndex >= 0 &&
      state.pendingBreakSegmentIndex === state.lineEndSegmentIndex &&
      state.lineEndGraphemeIndex === 0 &&
      returnsFromUnfitHyphen(state.prepared, state.lineStartSegmentIndex, state.lineEndSegmentIndex, state.pendingBreakWidth, state.fitLimit, state.hyphenEndKeepsJoin)
    ) {
      state.endSegmentIndex = state.fitBreakSegmentIndex
      state.endGraphemeIndex = 0
      state.endWidth = state.fitBreakPaintWidth
    } else if (state.endSegmentIndex < 0) {
      // A line that ends at its pending break paints the pending width, and one that wraps
      // right after a run of preserved spaces and tabs hangs it, with no break there too.
      state.endSegmentIndex = state.lineEndSegmentIndex
      state.endGraphemeIndex = state.lineEndGraphemeIndex
      state.endWidth = state.pendingBreakSegmentIndex === state.lineEndSegmentIndex && state.lineEndGraphemeIndex === 0 ? state.pendingBreakWidth
        : state.items !== undefined && state.hangEndSegmentIndex === state.lineEndSegmentIndex && state.lineEndGraphemeIndex === 0 ? state.hangStartWidth
        : state.lineW - state.lineEndTrimmed
    }
    state.cursor.segmentIndex = state.endSegmentIndex
    state.cursor.graphemeIndex = state.endGraphemeIndex
    // Preserved spaces and tabs before a hard break or the end of the text
    // hang only where they don't fit (CSS Text 3 §8.2).
    const hangsWhereUnfit =
      state.endGraphemeIndex === 0 &&
      state.hangEndSegmentIndex >= 0 &&
      (state.endSegmentIndex === state.hangEndSegmentIndex || state.endSegmentIndex === state.hangEndSegmentIndex + 1) &&
      (state.hangEndSegmentIndex === state.segmentCount || (state.segmentFlags[state.hangEndSegmentIndex]! & KIND_BITS) === HARD_BREAK)
    const paintWidth = (hangsWhereUnfit ? state.lineW - state.lineEndTrimmed : state.endWidth) +
      getTerminalLetterSpacing(state.prepared, state.openingEdges, state.hangingKinds, state.lineStartSegmentIndex, state.lineStartGraphemeIndex, state.endSegmentIndex, state.endGraphemeIndex)
    state.lineWidth = hangsWhereUnfit ? Math.max(state.hangStartWidth, Math.min(paintWidth, state.availableWidth)) : paintWidth
  }
}

function walkComplexLine(state: ComplexWalkState): number | null {
  state.lineStartSegmentIndex = state.cursor.segmentIndex
  state.lineStartGraphemeIndex = state.cursor.graphemeIndex
  state.lineW = 0
  state.hasContent = false
  state.lineEndSegmentIndex = state.lineStartSegmentIndex
  state.lineEndGraphemeIndex = state.lineStartGraphemeIndex
  state.pendingBreakSegmentIndex = -1
  // A line that ends at the pending break both fits and paints this width.
  state.pendingBreakWidth = 0
  // The opportunity the line returns to when a selected discretionary hyphen does
  // not fit, with that line's painted width: the latest whose line leaves room for
  // the hyphen, which Blink's retry against the width minus the hyphen finds, or
  // in Gecko and WebKit the latest that fits at the full width (reservedHyphenWidth).
  // Under keepsFirstBreak it is the line's first soft hyphen, whatever its hyphen
  // overflows, until a later opportunity fits.
  state.fitBreakSegmentIndex = -1
  state.fitBreakPaintWidth = 0
  // The latest run of preserved spaces and tabs: the segment after it, and the
  // line's width before it, less the line-end trim of the text it follows, with
  // the gap after the glyph before it. In a rich-inline paragraph, the run can
  // stay on its line after an object however far it overflows (staysAfterObject),
  // and that width also has the edges in the run that a line ending in it paints,
  // which are hangEdgesWidth wide (ParagraphSegmentData).
  state.hangEndSegmentIndex = -1
  state.hangStartWidth = 0
  state.hangStays = false
  state.hangEdgesWidth = 0
  // The line-end trim of the last whole segment, where only that trim let it fit, kept
  // past segments after it that take no room at the line end, as spaces. Every later
  // segment that takes room overflows, so the line ends before it and paints that much less.
  state.lineEndTrimmed = 0
  // Retained line-start ZWSP establishes the line without owning a spacing gap.
  state.zeroWidthPrefix = true
  state.afterUnspacedControl = false
  // Where the line ends and the width it paints there, once decided: -1 ends it at
  // the line's current end. With returnsFromHyphen, a line that ends at a selected
  // discretionary hyphen that doesn't fit returns to the recorded earlier opportunity.
  state.endSegmentIndex = -1
  state.endGraphemeIndex = 0
  state.endWidth = 0
  state.returnsFromHyphen = false

  state.lineWidth = null
  if ((state.segmentFlags[state.lineStartSegmentIndex]! & KIND_BITS) === HARD_BREAK) {
    // A line that starts at a hard break is an empty chunk's (normalizePreparedLineStart),
    // as wide as what a line pays where it starts there: inside a padded rich-inline item,
    // its extraWidth.
    state.cursor.segmentIndex = state.lineStartSegmentIndex + 1
    state.cursor.graphemeIndex = 0
    state.lineWidth = state.lineStartExtras === null ? 0 : state.lineStartExtras[state.lineStartSegmentIndex]!
  } else {
    decideComplexLine(state)

    finishComplexLine(state)
  }
  return state.lineWidth
}

// The specializer inlines these helpers so the shipped walk keeps its scan values local.
export function walkPreparedComplexLines(
  prepared: PreparedLineData,
  cursor: LayoutCursor,
  maxWidth: number,
  onLine: InternalLineVisitor | undefined,
  stats: LineStats | null,
  singleLine: boolean = false,
): number | null {
  const state = makeWalkState(prepared, cursor, maxWidth)
  let lastLineWidth: number | null = null
  while (true) {
    const lineStartSegmentIndex = cursor.segmentIndex
    const lineStartGraphemeIndex = cursor.graphemeIndex
    const lineWidth = walkComplexLine(state)
    if (lineWidth === null) break
    lastLineWidth = lineWidth
    if (stats !== null) {
      stats.lineCount++
      if (lineWidth > stats.maxLineWidth) stats.maxLineWidth = lineWidth
    }
    onLine?.(lineWidth, lineStartSegmentIndex, lineStartGraphemeIndex, cursor.segmentIndex, cursor.graphemeIndex)
    if (singleLine || !normalizePreparedLineStart(prepared, cursor)) break
  }
  return lastLineWidth
}
