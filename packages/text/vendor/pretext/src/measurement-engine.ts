// Engine profile moved from @chenglou/pretext 1.0.0.
import type { EngineProfile } from './measurement-profile.js'

let cachedEngineProfile: EngineProfile | null = null

export type LayoutEngine = 'blink' | 'webkit' | 'gecko'

// Engine profiles describe the layout engine, not the browser brand. Chrome,
// Firefox and Edge on iOS lay out with WebKit whatever their brand token (CriOS/,
// FxiOS/, EdgiOS/) or desktop-mode user agent, and an app's web view may name no
// browser at all. The user agent decides alone, so a page and its workers agree.
// navigator.vendor is not read: workers don't have it, and jsdom reports WebKit's
// beside Chromium's frozen AppleWebKit/537.36 token. WebKit froze 605.1.15, so
// 537.36 names Blink only beside Chrome/ or Chromium/, which Samsung's TV web
// views omit, and any other AppleWebKit/ version names WebKit.
export function getLayoutEngine(userAgent: string): LayoutEngine | null {
  if (userAgent.includes('Firefox/')) return 'gecko'
  if (userAgent.includes('AppleWebKit/537.36')) {
    return userAgent.includes('Chrome/') || userAgent.includes('Chromium/') ? 'blink' : null
  }
  return userAgent.includes('AppleWebKit/') ? 'webkit' : null
}

// Apart from buildEngineProfile(), so that what the line walkers call for every line stays a read
// of the cached profile, however much the profile holds. V8 inlines a function only while its
// bytecode takes at most 460 bytes (max_inlined_bytecode_size), minified or not. With the builder
// inside, this took 454 bytes with 23 fields and 463 with a 24th, which Chrome 154's V8 no longer
// inlined into the line counter and the simple stepper, and its plain line APIs ran
// 11-18% slower. Apart, it takes 21 (Node 23, V8 12.9). Check with node --print-bytecode and
// --trace-turbo-inlining (RESEARCH.md, JavaScript Engines).
export function getEngineProfile(): EngineProfile {
  return cachedEngineProfile ??= buildEngineProfile()
}

function buildEngineProfile(): EngineProfile {
  // A navigator can lack a userAgent, as React Native's does, where lib.dom's type says it is a
  // string: such a runtime names no engine, like one with no navigator.
  const ua = typeof navigator === 'undefined' ? '' : (navigator as { userAgent?: string }).userAgent ?? ''
  // Engines Pretext doesn't recognize take Blink's profile (RESEARCH.md, Decisions Log,
  // 2026-09-26).
  const engine = getLayoutEngine(ua) ?? 'blink'

  return {
    lineBreakScan: engine,
    graphemeTable: engine === 'webkit' ? 'apple/char' : engine === 'gecko' ? 'gecko/char' : 'chromium/char',
    lineFitEpsilon: engine === 'webkit' ? 1 / 64 : 0.005,
    cutWordFit: engine === 'blink' ? 'reshaped-lines' : 'segment-prefixes',
    prefixFitMinWidth: engine === 'webkit' ? 0 : 80,
    cutWordKeepsLigatures: engine === 'gecko',
    measureTextWithFollowingSpace: engine === 'webkit',
    kernsAcrossCanvasWords: engine === 'blink',
    letterSpaceDiscretionaryHyphen: engine !== 'blink',
    letterSpacingInAppUnits: engine === 'gecko',
    canvasLetterSpacingDropsLigatures: engine !== 'webkit',
    unspacedCursive: engine === 'blink' ? 'run' : engine === 'gecko' ? 'cluster' : 'none',
    letterSpacesGlyphs: engine === 'webkit',
    unfitHyphenRetreat: engine === 'blink' ? 'reduced-width' : engine === 'gecko' ? 'full-width' : 'full-width-or-first',
    hyphenFromPrimaryFont: engine !== 'gecko',
    letterSpaceTabStops: engine !== 'webkit',
    letterSpaceTabs: engine === 'webkit',
    tabMinimumCharacter: engine === 'gecko' ? '0' : ' ',
    tabsInAppUnits: engine === 'gecko',
    hangTabs: engine !== 'gecko',
    zeroWidthGlueTakesLine: engine !== 'gecko',
    hidesControlCharacters: engine === 'gecko',
    hanKerning: engine === 'blink',
    hangsIdeographicSpace: engine !== 'webkit',
    laysOutUnderDefaultLocale: engine === 'blink',
    namesGenericFamiliesByLanguage: engine === 'webkit' && !/^(?:Linux|Win32|Haiku|$)/.test(navigator.platform),
    hardBreakItemRetreat: engine === 'blink' ? 'item' : engine === 'webkit' ? 'fit' : 'last-grapheme',
    paddedOpeningFit: engine === 'blink' ? 'start' : engine === 'webkit' ? 'placed' : 'both',
    emptyAtomicAlwaysFits: engine === 'gecko',
    hangsSpacesPerTextFrame: engine === 'gecko',
    testsHyphenBeforeAtomic: engine !== 'webkit',
    transformsSegmentBreaksAcrossItems: engine === 'blink',
  }
}

