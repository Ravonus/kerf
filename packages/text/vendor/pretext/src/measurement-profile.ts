// Engine profile type moved from @chenglou/pretext 1.0.0 measurement.ts.
import type { GraphemeTable } from './graphemes.js'

export type EngineProfile = {
  // Where preparation finds break opportunities: each engine's own scan. Blink and WebKit
  // scan the text with their pair tables and ICU line rules (src/line-breaks.ts), Gecko
  // with nsLineBreaker over ICU4X's rules (src/gecko-line-breaks.ts), and engines Pretext
  // doesn't recognize take Blink's scan. A rich-inline paragraph's text is scanned as the
  // engine scans its inline items (analyzeText in src/analysis.ts). Blink runs one line-break
  // iterator over the text of the whole inline formatting context, and Gecko collects a word
  // across text frames until a space and breaks it in one pass, so every break near an item
  // boundary comes from the text the items join. WebKit finds breaks inside each inline box
  // from that box's own text, and decides a boundary between boxes from the previous box's
  // last two characters (TextUtil.cpp:374-396); it also finds a break next to every
  // white-space item, so before preserved white space that starts an item
  // (isAtSoftWrapOpportunity, InlineFormattingUtils.cpp:406-418), and its soft wrap index loop
  // ends the content it places after a line break item, so no break comes before one at any
  // boundary, after an atomic item too (nextWrapOpportunity, InlineFormattingUtils.cpp:469-475).
  lineBreakScan: 'blink' | 'webkit' | 'gecko'
  // Where grapheme clusters end: the engine's ICU character rules (src/graphemes.ts).
  // libicucore's add Apple's transcoding hints to Extend. Firefox's ICU4X data gives the
  // clusters Chrome's rules give, over its text run, which leaves out bidi controls.
  graphemeTable: GraphemeTable
  // What a line may overflow its width by and still fit: WebKit's own 1/64 px, which availableWidth()
  // adds (InlineLineBuilder.cpp:1172-1183). Blink and Gecko fit exactly in their own units, so their
  // 0.005 px is a named gap (ENGINE_FOLLOWUPS.md, Fitting arithmetic).
  lineFitEpsilon: number
  // How a segment is fit where a line narrower than it cuts it between letters, from Canvas
  // questions about the word (getSegmentFit). WebKit measures the word's grapheme prefixes
  // (TextUtil::breakWord), and Gecko adds the advances of the word shaped whole
  // (gfxTextRun::BreakAndMeasureText), which prefixes follow in joined scripts where
  // standalone graphemes don't: 'segment-prefixes' for both, which is WebKit's rule for a word
  // cut once and neither engine's rule otherwise (ENGINE_FOLLOWUPS.md, Emergency breaks inside
  // a word).
  // Blink reads positions from the word shaped whole and shapes a line's start and end again
  // wherever HarfBuzz calls the cut unsafe, as between two kerned or two joined letters
  // (ShapingLineBreaker::ShapeLine, shaping_line_breaker.cc:304-324, 511-584), so kerning
  // across a cut is on neither side and a line is as wide as its text shaped alone:
  // 'reshaped-lines'.
  cutWordFit: 'segment-prefixes' | 'reshaped-lines'
  // The least width from which a segment takes that fit; a narrower one adds up its graphemes
  // measured alone. A segment breaks only on a line narrower than itself, so every line at
  // least this wide gets the engine's fit, and WebKit's is every segment's. Gecko's and
  // Blink's 80px is a premise, not a browser rule: the fit costs Canvas calls for each new
  // word, most of the calls a lower floor adds are in words 24-80px wide, and taking them
  // from 24px or everywhere fixed adversarial lines at 24-80px but made Firefox prepare new
  // text much slower (RESEARCH.md, Break Opportunities From Engine Data; Decisions Log,
  // 2026-09-27 and 2026-10-05).
  prefixFitMinWidth: number
  // Gecko shapes a word once, whole, and never again (gfxTextRun::SetLineBreaks does nothing,
  // gfxTextRun.cpp:1292-1301), so a line adds up the advances its letters have in that one
  // shaping wherever it starts. A ligature's whole advance is on its first letter and none on
  // the rest (GetAdvanceForGlyph, gfxTextRun.cpp:1139-1151), so a line ends inside a ligature
  // only where the ligature starts the line and doesn't fit. Blink and WebKit shape or measure
  // a line from its own start, where the letters of a ligature cut in two each have a glyph.
  // The Gecko profile follows it in the words it fits from prefixes
  // (countLigaturesOnFirstLetter). The kerning those advances keep at a cut isn't ported
  // (ENGINE_FOLLOWUPS.md, Emergency breaks inside a word).
  cutWordKeepsLigatures: boolean
  // WebKit measures a text item together with a directly following U+0020 and
  // subtracts one space measured alone, so the item keeps its kerning with that
  // space wherever the line ends, under letter spacing too (getFollowingSpaceTail
  // in src/prepare.ts). Gecko shapes words without their spaces.
  measureTextWithFollowingSpace: boolean
  // Blink's layout shapes each run of one script and direction in one call, its spaces
  // included (HarfBuzzShaper::Shape, harfbuzz_shaper.cc:1063-1104), so in a font whose kerning
  // names the space glyph a word kerns with the space after it and a space with the word after
  // it, and in one that pairs kana a kana kerns with the kana after it. Its Canvas cuts a
  // string at each U+0020 and before each kana and reports none of it (PlainTextNode::SegmentWord
  // and NextWordEndIndex, plain_text_node.cc:92-153, 365-399), so preparation asks Canvas for it
  // another way (getSpaceKerning, getKanaKerning).
  kernsAcrossCanvasWords: boolean
  // WebKit and Gecko letter-space the visible discretionary hyphen itself.
  // Blink shapes it separately, without spacing.
  letterSpaceDiscretionaryHyphen: boolean
  // Gecko resolves letter spacing to whole app units, 1/60 px (ResolveLetterSpacing,
  // nsTextFrame.cpp:1949-1962): at -0.08px each character takes -5/60 px, and a spacing
  // under half a unit is none. Blink keeps 1/65536 px and WebKit a float, which
  // preparation takes as given (readLetterSpacing).
  letterSpacingInAppUnits: boolean
  // Under any letter spacing but 0 the engines shape text without its optional ligatures:
  // Blink turns off liga, clig and calt (font_features.cc:52-86), Gecko and WebKit liga,
  // clig, dlig and hlig (gfxFont.cpp:672-685 under nsLayoutUtils.cpp:6896-6904;
  // UnrealizedCoreTextFont.cpp:258-264 under StyleComputedStyleBase.cpp:318-333), so `fi`,
  // `fl` and `ffi` take their letters' own advances: 16px Roboto `difficult` is 52.87px
  // wide, and 54.20px plus the spacing under any. Blink's and Gecko's Canvas letterSpacing
  // turns them off as their pages do (canvas_rendering_context_2d_state.cc:871-907;
  // CanvasRenderingContext2D.cpp:5233-5241). WebKit's keeps them (FontCascade.cpp:81;
  // PLATFORM_BUGS.md), so the WebKit profile measures letter-spaced text with its ligatures
  // and comes out that much narrower than Safari (ENGINE_FOLLOWUPS.md, Letter spacing).
  canvasLetterSpacingDropsLigatures: boolean
  // Which text of the scripts whose letters join takes no letter spacing
  // (getUnspacedGraphemes in src/prepare.ts): in Blink a script run of one of them, but
  // for its spaces ('run'); in Gecko a cluster whose first character is of one of them
  // ('cluster'); in WebKit none, which spaces every glyph that has an advance
  // (ComplexTextController.cpp:793-796, WidthIterator.cpp:511-516).
  unspacedCursive: 'run' | 'cluster' | 'none'
  // WebKit's complex text path gives every glyph that has an advance one letter spacing
  // (ComplexTextController.cpp:793-796), not every grapheme: a Devanagari consonant takes
  // two with the sign of aa, i, ii, o or au, which is a glyph of its own beside it, and
  // one more for each half form before it, and lam and alef, drawn as one glyph, take one.
  // In 16px Kohinoor Devanagari at 1px Safari 27 spaces the two graphemes of
  // `\u0939\u093F\u0928\u094D\u0926\u0940` four times and in Devanagari MT five. Its Canvas spaces
  // text by the same code (setLetterSpacing puts the spacing on the font measureText
  // measures with, CanvasRenderingContext2DBase.cpp:3271-3296, 519-522), so the WebKit
  // profile asks it how many spacings each grapheme of such text takes (getExtraSpacings):
  // the page's count wherever the text has none of the optional ligatures the page turns
  // off and Canvas keeps (canvasLetterSpacingDropsLigatures), which Canvas counts as one
  // glyph. The simple path spaces every character that has an advance
  // (WidthIterator.cpp:511-516), and its text keeps one spacing a grapheme: Canvas would
  // count its `fi` as one glyph, and a character with no advance there, as a word joiner,
  // keeps a spacing the page doesn't give it (ENGINE_FOLLOWUPS.md, Letter spacing). Blink
  // and Gecko space clusters.
  letterSpacesGlyphs: boolean
  // When a selected discretionary hyphen does not fit, Blink retries the text
  // item against the width minus the hyphen (BreakText, line_breaker.cc:1705-1718,
  // Chromium 153), so the line ends at the latest earlier opportunity that leaves
  // room for it, whatever gives it: a space, a ZWSP, a soft hyphen, or a break
  // between two text segments, as after `-` or between ideographs. For a text
  // Pretext has no Blink item boundaries and applies the reduced width to every
  // earlier opportunity. A rich-inline paragraph takes each of its items for a
  // Blink item, so the break before an item's first segment leaves no such room
  // (getHyphenRooms in src/rich-inline.ts).
  // Gecko records a soft-hyphen break only where its hyphen fits, and any other
  // break where its line fits (gfxTextRun.cpp:1086-1101), so the line returns to
  // the latest opportunity that fits at the full width. WebKit wraps the content
  // after the soft hyphen, finds that the hyphen overflows (processInlineContent,
  // InlineContentBreaker.cpp:104-122) and builds the line again up to each of its
  // wrap opportunities, the latest first, until one ends without a soft hyphen or
  // fits its hyphen; the line's first opportunity stays whatever its hyphen
  // overflows (revertToLastNonOverflowingItem, TextOnlySimpleLineBuilder.cpp:459-480,
  // and rebuildLineForTrailingSoftHyphen, InlineLineBuilder.cpp:1860-1887, for lines
  // with inline boxes): 'full-width-or-first', the latest opportunity that fits at
  // the full width, else the line's first, which is the soft hyphen the walker
  // reaches before any opportunity on the line has fit. That return fits each text
  // item as WebKit measures it, on its own (TextUtil::width, TextUtil.cpp:62-100),
  // and an item ends at its soft hyphen, so under it no text counts as narrower
  // joined across one, as it does for Blink and Gecko (getJoinedNarrowing in
  // prepare.ts). In 16px Arial at 76-80px Safari 27 lays out
  // `the interna\u00ADtion\u00ADal` as `the` / `interna-` / `tional`, and at 40px
  // `trans\u00ADi\u00ADt\u00ADlantic` starts with `trans-`, 40.9px wide.
  // Each engine tests the hyphen against the line as it shapes it, which the
  // segments, measured apart, are wider than where letters kern or join across a
  // soft hyphen. Blink reads the line's width from the item shaped whole, soft
  // hyphens and all, and shapes the line's end again where the break isn't safe,
  // as between two kerned letters (the width BreakText tests, line_breaker.cc:
  // 1684-1703; ShapingLineBreaker::ShapeLine, shaping_line_breaker.cc:511-559): the
  // pairs across the soft hyphens a line passes narrow it, and the pair across the
  // one it ends at doesn't. Gecko drops soft hyphens from its text run
  // (IsDiscardable, nsTextFrameUtils.cpp:32-49), shapes a word once, whole
  // (SetLineBreaks, gfxTextRun.cpp:1292-1301), and adds up the advances before the
  // break (BreakAndMeasureText, gfxTextRun.cpp:1085-1097, 1139-1151), so there the
  // line's last letter keeps what the pair across its end put on its advance.
  // Premise: all of what the two sides measure narrower joined, as a GPOS pair's
  // kerning is. Its gap is a pair from a `kern` table, of which HarfBuzz leaves half
  // on the first letter (hb-kern.hh:102-106), and a ligature across the soft
  // hyphen, whose letters share its advance (ComputeLigatureData, gfxTextRun.cpp:
  // 238-322): there the profile keeps a hyphen that overflows by more than Firefox
  // lets it (ENGINE_FOLLOWUPS.md, Line edges).
  unfitHyphenRetreat: 'reduced-width' | 'full-width' | 'full-width-or-first'
  // A chosen soft hyphen paints U+2010 where a font has a glyph for it, else `-`.
  // WebKit and Blink ask the primary font alone (hyphenString,
  // StyleComputedStyle.cpp:419-431, measured by TextUtil::hyphenWidth,
  // TextUtil.cpp:621-624; ComputedStyle::HyphenString, shaped in
  // hyphen_result.cc:12-16), where Canvas draws U+2010 in a later family or a
  // system font, so the profile asks which family draws it (getHyphenText). Gecko
  // asks the first listed font that has it, else its default font, and shapes
  // U+2010 as any other text (MakeHyphenTextRun over GetFirstValidFont(U+2010),
  // gfxTextRun.cpp:2458-2473 and 2277-2360), which is what Canvas measures. The
  // premise there is that the default font has one, as macOS's, Helvetica, does.
  hyphenFromPrimaryFont: boolean
  // Pre-wrap tab stops count from the line's start, eight spaces apart, and a tab under a
  // minimum from the next stop takes the stop after it (CSS Text 3 §4.1.2). Blink and Gecko
  // count each of those spaces with its letter spacing (TabSize::GetPixelSize,
  // tab_size.h:24-33, since Chromium 140 under the runtime flag TabSizeWithSpacing, which
  // an older Chromium lacks and so counts plain spaces; Font::TabWidthInternal,
  // font.cc:303-317; ComputeTabWidthAppUnits, nsTextFrame.cpp:3875-3906). WebKit counts
  // plain spaces (FontCascade::tabWidth, FontCascadeInlines.h:76-93).
  letterSpaceTabStops: boolean
  // WebKit letter-spaces a tab as any glyph with an advance (WidthIterator.cpp:491-517).
  // Blink shapes a run of tabs apart from text, with no spacing (shape_result.cc:1898-1944),
  // and Gecko adds none after a tab (CanAddSpacingAfter, nsTextFrame.cpp:3860-3873).
  letterSpaceTabs: boolean
  // The character whose advance, halved, is the least a tab advances: a space in Blink and
  // WebKit (Font::TabWidth, font.cc:319-340; FontCascade::tabWidth), `0` in Gecko
  // (GetMinTabAdvanceAppUnits, nsTextFrame.cpp:1931-1937). Gecko reads the first available
  // font's `0`, or its average character width where it has none (ZeroOrAveCharWidth,
  // gfxFont.h:1698-1700). The profile takes Canvas's width of `0`, which a later font of
  // the list draws where the first has none, so under such a list, one led by an icon or a
  // single-script font, a tab near a stop can land a stop from Firefox's.
  tabMinimumCharacter: ' ' | '0'
  // Gecko counts a tab's position, its stops and its minimum in whole app units, sixtieths
  // of a pixel, so a tab exactly the minimum from its stop takes it (AdvanceToNextTab,
  // nsTextFrame.cpp:4298-4304). Blink and WebKit count in floats (fmodf).
  tabsInAppUnits: boolean
  // A run of preserved spaces and tabs at the end of a pre-wrap line hangs in Blink
  // and WebKit (CSS Text 3 §4.1.2). Gecko doesn't hang a tab, so a tab counts in the
  // line's fit and width there, as spaces do not, and one that doesn't fit goes to the
  // next line with the word before it (segmentAtLineBreaks() in src/analysis.ts).
  hangTabs: boolean
  // Blink's break-anywhere retry and WebKit's grapheme search can end a line after
  // zero-width glue when the grapheme after it doesn't fit, so the glue takes a line of
  // its own. Gecko drops soft hyphens from its text run and clusters a ZWSP with the marks
  // after it, so glue at a line start can't hold the line: the segment after it starts it.
  zeroWidthGlueTakesLine: boolean
  // Blink's HanKerning under text-spacing-trim: normal halts CJK opening and closing marks
  // next to other punctuation and at line ends (src/han-kerning.ts). WebKit and Gecko
  // don't trim them by default.
  hanKerning: boolean
  // Blink and Gecko hang U+3000 at a line end as they hang spaces (addIdeographicSpaceHangs
  // in src/prepare.ts). WebKit counts it: Safari 27 lays out 中文, U+3000, 中文 at 33px
  // in 16px PingFang SC in 3 lines.
  hangsIdeographicSpace: boolean
  // Blink lays out content without a language under its default locale, Chrome's UI
  // language, which Intl shows (getBlinkLineBreaks in src/line-breaks.ts): its line table,
  // font fallback and HanKerning's punctuation types follow it. Canvas under an empty page
  // language doesn't, so the Chromium profile prepares such a page under that locale, its
  // scan and its context alike (getPreparationLanguage). WebKit and Gecko take process
  // languages a page can't read and keep the page's.
  laysOutUnderDefaultLocale: boolean
  // On Cocoa, WebKit's page resolves serif, sans-serif, cursive, fantasy and monospace to the
  // family Core Text names for the page language wherever WebKit's script for it
  // isn't Common (FontDescriptionCocoa.cpp:77-118, asked first by CSSFontSelector.cpp:
  // 334-353). Its Canvas fonts carry no language: OffscreenCanvas starts from a bare
  // font description (OffscreenCanvasRenderingContext2D.cpp:93-130) and WebKit has no
  // canvas `lang` (WebKit #285993). The WebKit profile names the page's families in
  // the Canvas font (getWebKitGenericFamilies), from a table rather than a `<canvas>`
  // element, whose contexts force style updates (RESEARCH.md, Decisions Log, 2026-09-24).
  // Only on Cocoa: WebKit's other ports, such as WebKitGTK and WPE, resolve the keywords
  // from the settings, as Canvas does (platformResolveGenericFamily returns null under
  // !PLATFORM(COCOA), FontDescription.cpp:115-120), and a family the system lacks gives no
  // font, so Core Text's family would be measured in the standard font (FontCascadeFonts.cpp:
  // 211-218). A user agent can name a Mac anywhere, as Playwright's WebKit does on Linux, so
  // the port is read from navigator.platform, which WebKit compiles in: `Linux` and the
  // machine, `Win32`, `Haiku` or nothing off Cocoa (NavigatorBase.cpp:97-116). Its gap: a
  // page or a tool that overrides navigator.platform.
  namesGenericFamiliesByLanguage: boolean
  // Release Gecko draws C0 and C1 controls, U+2028 and U+2029 with no advance plus letter
  // spacing (gfxFont.cpp:3877-3892), where its Canvas measures VT, FS-US, NEL and U+2029 as a
  // space (CanvasRenderingContext2D.cpp:4634-4637) and other controls as a hexbox. Chrome and
  // Safari give most controls an advance on the page, as their Canvas does.
  hidesControlCharacters: boolean
  // Where a rich-inline line that has no break to return to ends when a padded item that starts
  // with a hard break, with none before it, doesn't fit its padding as the engine fits it there
  // (paddedOpeningFit; walkPreparedComplexLines in src/line-break.ts). Blink's retry of an overflowing
  // line breaks between any two graphemes (kBreakCharacter, line_breaker.cc:4258-4264,
  // 4620-4622), so the line ends before the item ('item'). Gecko's wrap opportunities come
  // before each cluster inside a text frame, none at its end (gfxTextRun.cpp:1046-1101), so the
  // line ends before the last grapheme of the text before the item, a preserved space too,
  // and keeps the item where that grapheme starts the line ('last-grapheme'). WebKit breaks the last run of the content that
  // doesn't fit where that run fits, TextUtil::breakWord in an overflowing run, else before the
  // last character of one that no text run follows (InlineContentBreaker.cpp:611-651), so it
  // ends the line there too, but after the preserved spaces that fit where the spaces that end
  // the text overflow the line, as spaces that hang can ('fit'). `Unbreakable`, then a span with
  // 20px of padding that starts with a line feed, in 15px Helvetica Neue at 93px; `Unbreakabl`,
  // a bold `e` and that span at 86-106px, which moves the `e`; and `Unbreakable   ` and that span
  // at 86-103px, which moves the last space in Firefox and in Safari the spaces that don't fit,
  // all three at 86px.
  hardBreakItemRetreat: 'item' | 'last-grapheme' | 'fit'
  // Which edges of a padded rich-inline item a line fits where the line takes the item's
  // opening and no more of it: a hard break or a zero-width space that starts the item, or
  // white space that starts it after an atomic item, and in Blink anywhere (getOpeningFit in
  // src/rich-inline.ts); the line paints both edges whatever it fitted. Blink adds a span's
  // start edge to the line when it opens (HandleOpenTag, line_breaker.cc:3957-3976), and only a
  // test-only flag narrows the line for its cloned end edge (BoxDecorationBreakCloneLineBreaking,
  // :454-461); the text or forced break after it finds the line overflowing and returns to the
  // line's latest break (HandleText, HandleForcedLineBreak, :1355-1372, 2856-2860), and the close
  // tags after a forced break trail it (:2912-2929): 'start'. The items a line takes after the
  // break it returns to stay on it where they are all trailable, white space with the tags of
  // spans that open and close among it (RewindOverflow, :4332-4424), so after any content Blink
  // fits no edge of a span of only white space. Where the line ends with preserved spaces
  // that overflow it, or that follow text in one item, which Blink's return breaks before them
  // (HandleOverflow, :4163-4185, at the run's start that ShapingLineBreaker::ShapeLine breaks at,
  // shaping_line_breaker.cc:490-495), the line trails them, taking the open tag and white space or
  // a forced break after them with no fit (HandleTrailingSpaces, :2426-2534), so Blink fits no
  // edge where the content before the spaces fits; after spaces that start an item, before which
  // no break comes (UAX #14 LB7), it fits the start edge with them. WebKit fits a box that opens
  // in the content it places without its cloned end edge (placedClonedDecorationWidth,
  // InlineLineBuilder.cpp:1501-1523), but that content runs on past the inline box ends after a
  // line break or white space (nextWrapOpportunity, InlineFormattingUtils.cpp:470-475, 530-538),
  // so it fits the end edge too of an item of white space that ends there, and leaves white space
  // that hangs before the box out of the fit (hangingContentWidth, InlineContentBreaker.cpp:
  // 183-186, 956-958): 'placed'. Gecko fits a frame's whole width, its cloned end edge too, and
  // lets only an empty frame past the line's end (CanPlaceFrame, nsLineLayout.cpp:1217-1270):
  // 'both'. In 15px Helvetica Neue, `Unbreakable` and a span with 20px padding that starts with a
  // line feed keep the line feed from 107px in Chrome and Safari, from 127px in Firefox, and
  // `Unbreakable   ` and that span from 86px in Chrome, 105px in Safari and 138px in Firefox;
  // `Ping `, the chip `@alice` and a span with 12px padding that starts with two spaces keep them
  // on the chip's line from 71px in Chrome and Safari and from 83px in Firefox, and one of only
  // two spaces at every width in Chrome and from 117px in Safari and Firefox.
  paddedOpeningFit: 'start' | 'placed' | 'both'
  // Gecko places a frame whose margin box is empty wherever it falls, on a line that already
  // overflows too ("Empty frames always fit right where they are", CanPlaceFrame,
  // nsLineLayout.cpp:1264-1269), so an atomic item of width 0 stays on the line it falls on,
  // unless the line ends before it: it breaks after white space that follows text already past
  // its end, which only a frame that always fits is left to show, and it goes back to a break
  // before the item where a frame with a width that continues the text comes next
  // (setEmptyObjectFacts in src/rich-inline.ts). Blink and WebKit fit it as any other atomic
  // inline and move it to the next line.
  emptyAtomicAlwaysFits: boolean
  // Where the preserved spaces that end a pre-wrap line's text and overflow the line still hang
  // once an item that takes no room follows them on the line, an atomic item of width 0 or an
  // item of soft hyphens alone. Gecko takes the hang out of each text frame's own width, the
  // trailing spaces past the line's end and no more, whatever follows the frame (hang =
  // min(max(0, advance - available), trimmable), nsTextFrame::ReflowText, nsTextFrame.cpp:
  // 11216-11229), so such an item is inside the line, at its end, and white space after it hangs
  // too. Blink reads the line's trailing spaces by walking back from its last item and stops at
  // an atomic inline or at text that doesn't end in a space (ComputeTrailingSpaceWidth,
  // line_info.cc:289-415), and in WebKit an atomic inline box ends the content that can hang
  // (ContinuousContent::append, InlineContentBreaker.cpp:943-947), so there the run of spaces
  // that hang ends at such an item.
  hangsSpacesPerTextFrame: boolean
  // Whether a soft hyphen that ends a rich-inline item right before an atomic item or a box needs
  // room for its hyphen to end the line. Blink tests the hyphen where it places the text item
  // that ends at the soft hyphen (SetBreakOffset, shaping_line_breaker.cc:211-216;
  // line_breaker.cc:1705-1718), and Gecko's soft-hyphen break fits only with its hyphen
  // (gfxTextRun.cpp:1086-1089; nsTextFrame.cpp:11432-11440). WebKit adds a soft hyphen's width
  // to the content it places only where nothing but text follows the soft hyphen inside that
  // content (setTrailingSoftHyphenWidth, InlineLineBuilder.cpp:1154-1165), which the closing
  // tag of a span that ends with one does, and tests the hyphen again only once content that
  // starts with text wraps after it (hasLeadingTextContent, InlineContentBreaker.cpp:41-50,
  // 113-121), which a box isn't: the hyphen is never tested there, and the line that ends at
  // it paints it past its width.
  testsHyphenBeforeAtomic: boolean
  // Blink transforms segment breaks in the text of the whole inline formatting context
  // (ShouldRemoveNewline and RemoveTrailingCollapsibleNewlineIfNeeded, inline_items_builder.cc).
  // Gecko transforms each text frame's own text (nsTextFrameUtils::TransformText), as
  // rich-inline transforms an item's, and WebKit turns segment breaks into spaces.
  transformsSegmentBreaksAcrossItems: boolean
}
