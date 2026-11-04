// One engine's provider: the lite tier in the base chunk, the exact tier (specialised Pretext) behind a
// dynamic import. A handle is lite when its text and font are in the lite envelope (src/lite.ts), else
// exact. A lite handle laid out narrower than its widest word needs an emergency break, which only the
// exact tier models: that layout loads the exact tier and is marked inexact until it has.
import { inBaseAlphabet } from './alphabet.js'
import type { exact } from './exact.js'
import {
  clearLite,
  countLite,
  lineTextLite,
  prepareLite,
  setLiteLocale,
  textFits,
  walkLite,
  type LiteHandle,
} from './lite.js'
import type { Handle, LayoutResult, LineRange, Pack, PrepareOptions, TextEngine } from './types.js'

declare const __ENGINE__: 'blink' | 'webkit' | 'gecko'
const EPS = __ENGINE__ === 'webkit' ? 1 / 64 : 0.005

type Exact = typeof exact
let X: Exact | null = null
let exactLoading: Promise<Exact> | null = null
let locale: string | undefined
let hasLocale = false
function loadExact(): Promise<Exact> {
  return (exactLoading ??= import('./exact.js').then((m) => {
    X = m.exact
    if (hasLocale) X.setLocale(locale)
    return X
  }))
}

class TextHandle implements Handle {
  exact = false
  ready: Promise<void> | null = null
  lite: LiteHandle | null = null
  x: Handle | null = null
  constructor(
    readonly text: string,
    readonly font: string,
    readonly opts: PrepareOptions | undefined,
  ) {}
}

// Hand a handle to the exact tier, now if it is loaded, else once it is.
function toExact(h: TextHandle): void {
  if (X) {
    const x = X.prepare(h.text, h.font, h.opts)
    h.x = x
    if (!h.lite) h.exact = x.exact
    h.ready =
      x.ready &&
      x.ready.then(() => {
        h.exact = true
        h.ready = null
      })
    return
  }
  h.ready = loadExact()
    .then(() => {
      toExact(h)
      return h.ready ?? undefined
    })
    .then(() => {
      h.exact = true
      h.ready = null
    })
}

function estimate(
  text: string,
  font: string,
  width: number,
  lineHeight: number,
): LayoutResult & { exact: false } {
  const size = +(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16)
  const lineCount =
    text.length === 0 ? 0 : Math.max(1, Math.ceil((text.length * size * 0.5) / Math.max(1, width)))
  return { height: lineCount * lineHeight, lineCount, exact: false }
}

// Emergency breaks need the exact tier. Until it is in, count each overflowing word as the lines it
// would fill at full width: the right order of magnitude, flagged inexact.
function liteOverflowEstimate(
  h: LiteHandle,
  width: number,
  lineHeight: number,
): LayoutResult & { exact: false } {
  const limit = Math.max(1, width)
  let lines = 0,
    x = 0
  for (let i = 0; i < h.widths.length; i++) {
    const w = h.widths[i]!
    if (!h.text[i]) {
      x += w
      continue
    }
    if (w > limit) {
      if (x > 0) lines++
      lines += Math.ceil(w / limit) - 1
      x = w % limit
      continue
    }
    if (x + w > limit) {
      lines++
      x = w
    } else x += w
  }
  if (x > 0 || lines === 0) lines++
  return { height: lines * lineHeight, lineCount: lines, exact: false }
}

export const engine: TextEngine = {
  engine: __ENGINE__,
  prepare(text, font, opts) {
    const h = new TextHandle(text, font, opts)
    if (inBaseAlphabet(text) && textFits(text, opts))
      h.lite = prepareLite(text, font, opts?.segments)
    if (h.lite) h.exact = true
    else toExact(h)
    return h
  },
  layout(handle, width, lineHeight) {
    const h = handle as TextHandle
    if (h.lite && h.lite.maxText <= Math.max(0, width) + EPS) {
      const lineCount = countLite(h.lite, width)
      return { height: lineCount * lineHeight, lineCount }
    }
    if (h.lite && !h.x) toExact(h)
    if (X && h.x && h.x.exact) return X.layout(h.x, width, lineHeight)
    return h.lite
      ? liteOverflowEstimate(h.lite, width, lineHeight)
      : estimate(h.text, h.font, width, lineHeight)
  },
  lines(handle, width) {
    const h = handle as TextHandle
    if (h.lite && h.lite.maxText <= Math.max(0, width) + EPS) {
      const out: LineRange[] = []
      walkLite(h.lite, width, (w, s, e) => {
        out.push({
          width: w,
          start: { segmentIndex: s, graphemeIndex: 0 },
          end: { segmentIndex: e, graphemeIndex: 0 },
          lite: true,
        })
      })
      return out
    }
    if (h.lite && !h.x) toExact(h)
    return X && h.x && h.x.exact ? X.lines(h.x, width) : []
  },
  lineText(handle, line) {
    const h = handle as TextHandle
    if (line.lite && h.lite?.source !== undefined)
      return lineTextLite(h.lite, line.start.segmentIndex, line.end.segmentIndex)
    if (!X || !h.x)
      throw new Error(
        'text-engine: lineText needs a handle prepared with { segments: true } once it is exact',
      )
    return X.lineText(h.x, line)
  },
  clear() {
    clearLite()
    X?.clear()
  },
  needs(text, font, opts) {
    if (inBaseAlphabet(text) && textFits(text, opts)) return []
    const out: Pack[] = X ? [] : ['exact']
    // the exact tier's own packs, by the same pre-check it runs
    if (!inBaseAlphabet(text)) out.push('scripts')
    if (opts?.letterSpacing) out.push('spacing')
    return out
  },
  async load(packs) {
    if (!packs.length) return
    const x = await loadExact()
    await x.load(packs.filter((p): p is Exclude<Pack, 'exact'> => p !== 'exact'))
  },
  loaded: () => (X ? ['exact', ...X.loaded()] : []),
  setLocale(l) {
    locale = l
    hasLocale = true
    setLiteLocale(l)
    X?.setLocale(l)
  },
}
