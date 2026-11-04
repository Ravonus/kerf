// The base alphabet: code points whose break rules ship in the base chunk. Text with any other code point
// needs the `scripts` pack (the engine's full tables plus the CJK, Thai/Lao/Khmer/Myanmar code).
// alphabet.json is the source of truth; scripts/gendata.mjs restricts the tables to the same ranges.
//
// Basic Latin through Latin Extended-B, IPA, spacing modifiers, combining diacritics, Latin Extended
// Additional, General Punctuation, currency, combining marks for symbols (keycaps), letterlike symbols, arrows, math operators, misc technical,
// enclosed alphanumerics, geometric shapes, misc symbols and dingbats, supplemental arrows, misc symbols
// and arrows, variation selectors, the emoji and symbol planes U+1F000..U+1FAFF, and tags (flag sequences).
import ranges from './alphabet.json'

const flat: number[] = []
for (const [lo, hi] of [...ranges].sort((a, b) => a[0]! - b[0]!)) {
  if (flat.length && lo! <= flat[flat.length - 1]! + 1)
    flat[flat.length - 1] = Math.max(flat[flat.length - 1]!, hi!)
  else flat.push(lo!, hi!)
}

function inRanges(c: number): boolean {
  for (let i = 0; i < flat.length; i += 2) {
    if (c < flat[i]!) return false
    if (c <= flat[i + 1]!) return true
  }
  return false
}

// True when every code point of `text` is in the base alphabet. One pass; the loop stays on the first
// branch for Latin-1 text.
export function inBaseAlphabet(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i)
    if (c < 0x370) continue
    if ((c & 0xfc00) === 0xd800 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1)
      if ((d & 0xfc00) === 0xdc00) {
        c = ((c - 0xd800) << 10) + d - 0xdc00 + 0x10000
        i++
      }
    }
    if (!inRanges(c)) return false
  }
  return true
}
