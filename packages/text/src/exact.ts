// The exact tier: one engine's provider over its specialised Pretext build (gen/<engine>, aliased as
// @engine by scripts/build.mjs). A lazy chunk: src/engine.ts loads it for text outside the lite envelope.
// Its own packs (complex, scripts, spacing, families, rare) are further dynamic chunks.
import {
  clearCache,
  layout as pretextLayout,
  materializeLineRange,
  prepare as pretextPrepare,
  prepareWithSegments,
  setLocale as pretextSetLocale,
  walkLineRanges,
  type PreparedText,
  type PreparedTextWithSegments,
} from '@engine/layout.js'
import { PackMissing } from '@engine/packs.js'
import { inBaseAlphabet } from './alphabet.js'
import type { Handle, LayoutResult, LineRange, Pack, PrepareOptions } from './types.js'

type ExactPack = Exclude<Pack, 'exact'>

declare const __ENGINE__: 'blink' | 'webkit' | 'gecko'

const importers: Record<ExactPack, () => Promise<unknown>> = {
  complex: () => import('@engine/pack-complex.js'),
  scripts: () => import('@engine/pack-scripts.js'),
  spacing: () => import('@engine/pack-spacing.js'),
  families: () => import('@engine/pack-families.js'),
  // prepare-time code that never ran on in-alphabet text (scripts/coverage.mjs); loaded on first PackMissing
  rare: () => import('@engine/pack-rare.js'),
}
const done = new Set<ExactPack>()
const inflight = new Map<ExactPack, Promise<unknown>>()

function load(packs: readonly ExactPack[]): Promise<void> {
  return Promise.all(
    packs
      .filter((p) => !done.has(p))
      .map((p) => {
        let f = inflight.get(p)
        if (!f)
          inflight.set(
            p,
            (f = importers[p]().then(() => {
              done.add(p)
            })),
          )
        return f
      }),
  ).then(() => {})
}

const genericRe = /(?:^|[\s,])(?:serif|sans-serif|cursive|fantasy|monospace)\s*(?:,|$)/i

function needs(text: string, font: string, opts?: PrepareOptions): ExactPack[] {
  const out: ExactPack[] = []
  if (!inBaseAlphabet(text)) out.push('scripts')
  if (opts?.letterSpacing) out.push('spacing')
  if (__ENGINE__ === 'webkit' && genericRe.test(font)) out.push('families')
  return out
}

type Internal = { simpleLineWalkFastPath: boolean }

class TextHandle implements Handle {
  exact = false
  ready: Promise<void> | null = null
  p: PreparedText | null = null
  constructor(
    readonly text: string,
    readonly font: string,
    readonly opts: PrepareOptions | undefined,
  ) {}
}

function build(h: TextHandle, attempt = 0): void {
  const missing = needs(h.text, h.font, h.opts).filter((p) => !done.has(p))
  if (missing.length === 0) {
    try {
      h.p = h.opts?.segments
        ? prepareWithSegments(h.text, h.font, h.opts)
        : pretextPrepare(h.text, h.font, h.opts)
    } catch (e) {
      if (!(e instanceof PackMissing)) throw e
      missing.push(e.pack as ExactPack) // safety net: a guard the pre-check did not foresee
    }
    // Only layout reads the full walker, so a handle that needs it is complete already: it becomes
    // exact once the walker loads, without preparing again.
    if (h.p && !(h.p as unknown as Internal).simpleLineWalkFastPath && !done.has('complex')) {
      missing.push('complex')
      if (!done.has('spacing') && !missing.includes('spacing')) missing.push('spacing') // the complex walker asks it for a line's trailing gap, at any letter-spacing
    }
  }
  if (missing.length === 0) {
    h.exact = true
    h.ready = null
    return
  }
  if (attempt > 4) throw new Error('text-engine: packs did not settle')
  h.ready = load(missing).then(() => {
    if (missing.includes('complex') && h.p && missing.length === 1) {
      h.exact = true
      h.ready = null
    } else build(h, attempt + 1)
  })
}

// While a pack loads: about half an em per character, at least one line. Marked inexact.
function estimate(h: TextHandle, width: number, lineHeight: number): LayoutResult {
  const size = +(/(\d+(?:\.\d+)?)px/.exec(h.font)?.[1] ?? 16)
  const lineCount =
    h.text.length === 0
      ? 0
      : Math.max(1, Math.ceil((h.text.length * size * 0.5) / Math.max(1, width)))
  return { height: lineCount * lineHeight, lineCount }
}

export const exact = {
  prepare: (text: string, font: string, opts?: PrepareOptions): Handle => {
    const h = new TextHandle(text, font, opts)
    build(h)
    return h
  },
  layout: (handle: Handle, width: number, lineHeight: number): LayoutResult => {
    const h = handle as TextHandle
    return h.exact ? pretextLayout(h.p!, width, lineHeight) : estimate(h, width, lineHeight)
  },
  lines: (handle: Handle, width: number): LineRange[] => {
    const h = handle as TextHandle
    if (!h.exact) return []
    const out: LineRange[] = []
    walkLineRanges(h.p!, width, (l) => {
      out.push({ width: l.width, start: l.start, end: l.end })
    })
    return out
  },
  lineText: (handle: Handle, line: LineRange): string => {
    const h = handle as TextHandle
    if (!h.exact || !h.opts?.segments)
      throw new Error(
        'text-engine: lineText needs an exact handle prepared with { segments: true }',
      )
    return materializeLineRange(h.p as PreparedTextWithSegments, line).text
  },
  clear: () => {
    clearCache()
  },
  needs,
  load,
  loaded: (): ExactPack[] => [...done],
  setLocale: (locale?: string) => {
    pretextSetLocale(locale)
  },
}
