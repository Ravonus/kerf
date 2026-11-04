// The specialised scans (gen/<engine>, tables restricted to the base alphabet) break exactly where upstream's
// full scans do, on in-alphabet text: the corpus and a fuzz over the alphabet's ranges.
import { describe, expect, it } from 'vitest'
import * as up from '../vendor/pretext/src/line-breaks.js'
import * as upGecko from '../vendor/pretext/src/gecko-line-breaks.js'
import * as blink from '../gen/blink/line-breaks.js'
import * as webkit from '../gen/webkit/line-breaks.js'
import * as gecko from '../gen/gecko/gecko-line-breaks.js'
import alphabet from '../src/alphabet.json'
import { inBaseAlphabet } from '../src/alphabet.js'
import { makeCorpus } from './accuracy/corpus.js'

function fuzz(n: number, seed = 7): string[] {
  let s = seed >>> 0
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296
  const ranges = alphabet as [number, number][]
  const pick = () => {
    if (rnd() < 0.55) return String.fromCharCode(0x61 + Math.floor(rnd() * 26))
    if (rnd() < 0.3) return ' '
    const [a, b] = ranges[Math.floor(rnd() * ranges.length)]!
    const cp = a + Math.floor(rnd() * (b - a + 1))
    return cp >= 0xd800 && cp <= 0xdfff ? 'x' : String.fromCodePoint(cp)
  }
  return Array.from({ length: n }, () =>
    Array.from({ length: 1 + Math.floor(rnd() * 60) }, pick).join(''),
  )
}

const texts = [
  ...['latin', 'latin-hard', 'emoji'].flatMap((c) => makeCorpus(c, 400)),
  ...fuzz(4000),
].filter((t) => inBaseAlphabet(t))

type Scan = {
  name: string
  ours: (t: string, flag: boolean) => unknown
  theirs: (t: string, flag: boolean) => unknown
  flags: boolean[]
}
const scans: Scan[] = [
  ...[null, 'en', 'ja'].flatMap((lang) => [
    // flag: keep-all
    {
      name: `blink, lang ${lang}`,
      ours: (t: string, f: boolean) => [...blink.getBlinkLineBreaks(t, f, lang)],
      theirs: (t: string, f: boolean) => [...up.getBlinkLineBreaks(t, f, lang)],
      flags: [false, true],
    },
    // flag: pre-wrap (preserved newlines)
    {
      name: `webkit, lang ${lang}`,
      ours: (t: string, f: boolean) => [...webkit.getWebKitLineBreaks(t, f, false, lang)],
      theirs: (t: string, f: boolean) => [...up.getWebKitLineBreaks(t, f, false, lang)],
      flags: [false, true],
    },
  ]),
  {
    name: 'gecko',
    ours: (t, f) => gecko.getGeckoLineBreaks(t, f, false, 'gecko/char'),
    theirs: (t, f) => upGecko.getGeckoLineBreaks(t, f, false, 'gecko/char'),
    flags: [false, true],
  },
]

// Without the rare pack a scan either matches or throws PackMissing (which the providers catch: the exact
// tier loads the pack and prepares again, the lite tier hands the text to the exact tier). With it, it matches.
describe('restricted break scans match upstream on the base alphabet', () => {
  it('has a meaningful sample', () => {
    expect(texts.length).toBeGreaterThan(4000)
  })
  const misses: Record<string, number> = {}
  for (const sc of scans)
    it(`${sc.name}: base chunk alone`, () => {
      let miss = 0
      for (const t of texts)
        for (const f of sc.flags) {
          let ours: unknown
          try {
            ours = sc.ours(t, f)
          } catch (e) {
            expect((e as Error).constructor.name).toBe('PackMissing')
            miss++
            continue
          }
          expect(ours, t).toEqual(sc.theirs(t, f))
        }
      misses[sc.name] = miss
    })
  it('loads the rare packs', async () => {
    await Promise.all([
      import('../gen/blink/pack-rare.ts'),
      import('../gen/webkit/pack-rare.ts'),
      import('../gen/gecko/pack-rare.ts'),
    ])
    console.log('PackMissing before rare, per scan (texts x flags):', JSON.stringify(misses))
  })
  for (const sc of scans)
    it(`${sc.name}: with the rare pack`, () => {
      for (const t of texts)
        for (const f of sc.flags) expect(sc.ours(t, f), t).toEqual(sc.theirs(t, f))
    })
})
