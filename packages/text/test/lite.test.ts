// The lite tier's layout on synthetic handles (no Canvas): line counts and ranges against a plain greedy
// reference with hanging spaces, the same additions in the same order as Pretext's countPreparedLines().
import { describe, expect, it } from 'vitest'
import { countLite, walkLite, type LiteHandle } from '../src/lite.js'
import { inBaseAlphabet } from '../src/alphabet.js'
import { detectEngine } from '../src/detect.js'

const EPS = 0.005 // blink, as vitest.config.ts defines __ENGINE__

function handle(words: number[], space: number): LiteHandle {
  const widths: number[] = [],
    text: number[] = []
  words.forEach((w, i) => {
    widths.push(w)
    text.push(1)
    if (i < words.length - 1) {
      widths.push(space)
      text.push(0)
    }
  })
  return {
    widths: Float64Array.from(widths),
    text: Uint8Array.from(text),
    maxText: Math.max(0, ...words),
  }
}

// Reference: greedy lines of words; a line's spaces hang; a word starts a new line when the line so far,
// its spaces included, plus the word exceeds the width.
function reference(h: LiteHandle, maxWidth: number) {
  const limit = Math.max(0, maxWidth) + EPS
  const lines: { width: number; start: number; end: number }[] = []
  let i = 0
  while (i < h.widths.length) {
    while (i < h.widths.length && !h.text[i]) i++
    if (i >= h.widths.length) break
    const start = i
    let w = h.widths[i++]!,
      content = w
    while (i < h.widths.length && w + h.widths[i]! <= limit) {
      w += h.widths[i]!
      if (h.text[i]) content = w
      i++
    }
    if (i < h.widths.length && !h.text[i]) i++ // the hanging space ends the line even where it overflows
    lines.push({ width: content, start, end: i })
  }
  return lines
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
}

describe('lite layout', () => {
  it('counts the obvious cases', () => {
    expect(countLite(handle([], 4), 100)).toBe(0)
    expect(countLite(handle([10], 4), 100)).toBe(1)
    expect(countLite(handle([10, 10, 10], 4), 38)).toBe(1) // 10+4+10+4+10 = 38 fits
    expect(countLite(handle([10, 10, 10], 4), 37.99)).toBe(2)
    expect(countLite(handle([10, 10, 10], 4), 37.996)).toBe(1) // within lineFitEpsilon
    expect(countLite(handle([30, 30], 4), 30)).toBe(2) // the hanging space never forces a line
  })
  it('ends a line after its hanging space, as walkLineRanges() does', () => {
    const got: number[][] = []
    walkLite(handle([30, 30], 4), 30, (w, s, e) => {
      got.push([w, s, e])
    })
    expect(got).toEqual([
      [30, 0, 2],
      [30, 2, 3],
    ])
  })
  it('matches the greedy reference, counts and ranges, on random handles', () => {
    const r = rng(11)
    for (let k = 0; k < 3000; k++) {
      const words = Array.from({ length: 1 + Math.floor(r() * 40) }, () => 1 + r() * 80)
      const h = handle(words, 3 + r() * 2)
      for (const w of [h.maxText, h.maxText + 0.3, 120, 200, 377.5, 900]) {
        const ref = reference(h, w)
        const got: typeof ref = []
        const n = walkLite(h, w, (width, start, end) => {
          got.push({ width, start, end })
        })
        expect(n).toBe(ref.length)
        expect(got).toEqual(ref)
        expect(countLite(h, w)).toBe(ref.length)
      }
    }
  })
})

describe('base alphabet', () => {
  it('takes Latin, punctuation, emoji, flags and keycaps', () => {
    for (const t of [
      'Hello, world.',
      'naïve café — “quoted” … ½ → ∑',
      '🚀 👍🏽 👨‍👩‍👧 ❤️ 🇫🇷 1️⃣',
      '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'Ångström œuvre ẞ',
    ])
      expect(inBaseAlphabet(t), t).toBe(true)
  })
  it('sends other scripts to the scripts pack', () => {
    for (const t of [
      'Привет',
      'Ελληνικά',
      'مرحبا',
      'שלום',
      '中文',
      'かな',
      '한국어',
      'ภาษาไทย',
      'नमस्ते',
      'a　b',
    ])
      expect(inBaseAlphabet(t), t).toBe(false)
  })
})

describe('engine detection', () => {
  it('reads the user agent as Pretext does', () => {
    expect(
      detectEngine(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
      ),
    ).toBe('blink')
    expect(
      detectEngine(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
      ),
    ).toBe('webkit')
    expect(
      detectEngine(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/150.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('webkit')
    expect(
      detectEngine(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:157.0) Gecko/20100101 Firefox/157.0',
      ),
    ).toBe('gecko')
    expect(detectEngine('')).toBe('blink')
  })
})
