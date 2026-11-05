// Font measurements moved from @chenglou/pretext 1.0.0.
import { getContext, getSegmentMetrics } from './measurement-metrics.js'
import type { FontMeasurement } from './measurement-types.js'

// A font string's size, with its line height, after which its family list starts.
export const fontSizeRe = /\dpx(?:\s*\/\s*\S+)?\s+/
// One family of a family list, with the white space around it.
export const familyRe = /(?:"[^"]*"|'[^']*'|[^,])+/g

// The string a chosen soft hyphen paints in the font where the engine takes it from the
// primary font (hyphenFromPrimaryFont): U+2010 where that font has a glyph for it, else `-`.
// Where both measure the same in the font, either does. Else Canvas tells which family draws
// a character from two lists: the engines draw each character with the first listed font
// that has its glyph (WebKit's glyphDataForVariant, FontCascadeFonts.cpp:426-439), so a family
// draws it where `family, monospace` and `family, serif` measure it alike and the two generic
// families alone don't. The primary font is the first listed family's that gives a font,
// whether or not it has a glyph for a space (WebKit's primaryFont, FontCascadeFonts.h:225-254;
// Blink's DeterminePrimarySimpleFontDataCore, font_fallback_list.cc:88-143). Canvas can't tell
// a family that gives no font from one that lacks the character, so the premise is that the
// primary font draws a space, and it is taken as the first family's that does. `-` where the
// generic families measure alike, which tells nothing, or the font string has no size in px.
// What the premise gets wrong (ENGINE_FOLLOWUPS.md, Line edges): a first family whose font
// has no space, an icon font, is skipped where the engines take it; a family split into faces
// by unicode-range is asked whole, where the engines ask only the face that holds the space;
// and where no listed family gives a font the answer is `-`, where the engines ask their
// last-resort font.
export function getHyphenText(measurement: FontMeasurement): string {
  if (measurement.hyphenText !== null) return measurement.hyphenText
  const font = measurement.canvasFont
  const size = fontSizeRe.exec(font)
  let hyphenText = '-'
  if (size !== null && getSegmentMetrics('\u2010', measurement).width !== getSegmentMetrics('-', measurement).width) {
    const context = getContext(measurement)
    const start = size.index + size[0].length
    const prefix = font.slice(0, start)
    const families = font.slice(start).match(familyRe) ?? []
    const monospace = prefix + 'monospace'
    const serif = prefix + 'serif'
    if (measureIn(context, monospace, ' ') !== measureIn(context, serif, ' ') && measureIn(context, monospace, '\u2010') !== measureIn(context, serif, '\u2010')) {
      for (let i = 0; i < families.length; i++) {
        const beforeMonospace = `${prefix}${families[i]}, monospace`
        const beforeSerif = `${prefix}${families[i]}, serif`
        if (measureIn(context, beforeMonospace, ' ') !== measureIn(context, beforeSerif, ' ')) continue
        if (measureIn(context, beforeMonospace, '\u2010') === measureIn(context, beforeSerif, '\u2010')) hyphenText = '\u2010'
        break
      }
    }
    context.font = font
  }
  measurement.hyphenText = hyphenText
  return hyphenText
}

function measureIn(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, font: string, text: string): number {
  context.font = font
  return context.measureText(text).width
}


export function parseFontSize(font: string): number {
  // A failed size can restart at the next digit run, not at every digit in it.
  const m = font.match(/(?:^|\D)(\d+(?:\.\d+)?)\s*px/)
  return m ? parseFloat(m[1]!) : 16
}
