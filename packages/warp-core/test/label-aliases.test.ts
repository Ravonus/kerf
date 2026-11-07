// Pin the original Unicode membership independently of the production aliases.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { labelChars } from '../src/floating-label'

const original =
  /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Mandaic}]/u
const aliases = [
  ['Arabic', 'Arab'],
  ['Syriac', 'Syrc'],
  ['Nko', 'Nkoo'],
  ['Mongolian', 'Mong'],
  ['Adlam', 'Adlm'],
  ['Hanifi_Rohingya', 'Rohg'],
  ['Mandaic', 'Mand'],
] as const

test('JOINING exact equality covers 1114112 code points including surrogate units', () => {
  const text = readFileSync(resolve(import.meta.dirname, '../src/floating-label.ts'), 'utf8')
  const literals = [...text.matchAll(/\bconst JOINING\s*=\s*\/([^/\r\n]+)\/([a-z]*)/g)]
  expect(literals).toHaveLength(1)
  const production = new RegExp(literals[0]![1]!, literals[0]![2])
  expect(production.flags).toBe('u')
  const pairs = aliases.map(([long, short]) => ({
    long,
    short,
    before: new RegExp(String.raw`\p{Script=${long}}`, 'u'),
    after: new RegExp(String.raw`\p{sc=${short}}`, 'u'),
    mismatches: 0,
    matches: 0,
  }))
  let checked = 0,
    mismatches = 0,
    surrogateUnits = 0
  let firstMismatch: number | null = null
  for (let point = 0; point < 0x110000; point++) {
    const character = String.fromCodePoint(point)
    checked++
    if (point >= 0xd800 && point <= 0xdfff) surrogateUnits++
    if (production.test(character) !== original.test(character)) {
      mismatches++
      firstMismatch ??= point
    }
    for (const pair of pairs) {
      const before = pair.before.test(character)
      if (before) pair.matches++
      if (before !== pair.after.test(character)) pair.mismatches++
    }
  }
  const summary = {
    checked,
    mismatches,
    firstMismatch,
    surrogateUnits,
    flags: production.flags,
    aliases: pairs.map(({ long, short, matches, mismatches: aliasMismatches }) => ({
      long,
      short,
      matches,
      mismatches: aliasMismatches,
    })),
    node: process.version,
    v8: process.versions.v8,
    unicode: process.versions.unicode,
  }
  console.info('JOINING Unicode audit:', JSON.stringify(summary))
  expect(checked).toBe(1114112)
  expect(surrogateUnits).toBe(2048)
  expect(mismatches).toBe(0)
  expect(pairs.map((pair) => pair.mismatches)).toEqual([0, 0, 0, 0, 0, 0, 0])
  expect(pairs.every((pair) => pair.matches > 0)).toBe(true)
})

const examples: [string, string, string[]][] = [
  ['Arabic', 'العربية', ['العربية']],
  ['Syriac', 'ܫܠܡܐ', ['ܫܠܡܐ']],
  ['Nko', 'ߒߞߏ', ['ߒߞߏ']],
  ['Mongolian', 'ᠮᠣᠩᠭᠣᠯ', ['ᠮᠣᠩᠭᠣᠯ']],
  ['Adlam', '\u{1e900}\u{1e901}', ['\u{1e900}\u{1e901}']],
  ['Hanifi Rohingya', '\u{10d00}\u{10d01}', ['\u{10d00}\u{10d01}']],
  ['Mandaic', '\u0840\u0841', ['\u0840\u0841']],
  ['emoji', 'Hi 👩‍💻', ['H', 'i', ' ', '👩‍💻']],
  ['combining', 'éa', ['é', 'a']],
  ['whitespace', '  Full  name \n', 'Full name'.split('')],
  ['empty', '', []],
  ['family grapheme', '👩‍👩‍👧‍👦', ['👩‍👩‍👧‍👦']],
]
test.each(examples)('labelChars aliases retain %s output', (_name, text, expected) => {
  expect(labelChars(text)).toEqual(expected)
})

test('labelChars aliases preserve the missing-Segmenter fallback', () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
  try {
    expect(labelChars(' é😀  ')).toEqual(['e', '́', '😀'])
    expect(labelChars('اب')).toEqual(['ا', 'ب'])
    expect(labelChars(' a  b ')).toEqual(['a', ' ', 'b'])
    expect(labelChars('  ')).toEqual([])
  } finally {
    Object.defineProperty(Intl, 'Segmenter', descriptor)
  }
})
