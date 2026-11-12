// The prompt a slot sends: a template per operation, with the style bible's manner, light and palette around the
// slot's intent. Agents write only `says`; the words around it come from here, the same every time.
import { parseOut } from './recipe.mjs'

const regionsOf = (on) =>
  on
    .split(/\s+/)
    .filter((word) => word.startsWith('id:'))
    .map((word) => word.slice(3))

const passesOf = (on) =>
  on
    .split(/\s+/)
    .filter((word) => word && !word.startsWith('id:'))
    .join(' and ')

/** The opening line for each operation. */
const TEMPLATES = {
  make: (slot, tiles) =>
    tiles
      ? 'Paint the subject below as a seamless, tileable texture on a plain ground: it repeats with no visible edge, seam or vignette, lit evenly.'
      : 'Paint the subject below on a plain, even ground, with nothing else in the frame.',
  over: (slot) => {
    const regions = regionsOf(slot.on)
    const where = regions.length
      ? `the ${regions.join(', ')} region${regions.length > 1 ? 's' : ''}`
      : 'the guide'
    return `Repaint the attached guide in the manner below. Keep its composition, horizon, silhouettes and layout exactly; change only the handling and colour in ${where}.`
  },
  control: (slot) =>
    `Paint the subject below, following the attached ${passesOf(slot.on) || 'guide'} exactly for shape and placement.`,
  animate: () =>
    'Animate the attached still: keep its composition and manner, and move only what the subject below names.',
  loop: () =>
    'Make a seamless loop of the attached still: the last frame leads into the first with no jump, and only what the subject below names moves.',
}

const line = (text) => text.trim().replace(/[.\s]+$/, '')

/** The prompt and negative prompt for a resolved slot under a style bible. Deterministic text. */
export function buildPrompt(style, slot) {
  const tiles = parseOut(slot.out).some((out) => out?.kind === 'tile')
  const palette = Object.values(style.palette).join(', ')
  const prompt = [
    TEMPLATES[slot.op](slot, tiles),
    `Subject: ${line(slot.says)}.`,
    `Manner: ${line(style.manner)}.`,
    `Light: ${line(style.light)}.`,
    `Palette: ${palette}.`,
  ].join('\n')
  return { prompt, negative: style.avoid.trim() }
}
