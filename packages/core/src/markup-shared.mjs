// Pure HTML helpers usable by untranspiled Node and browser code.
export { markup } from './markup.mjs'

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escape text for an attribute, text, or both contexts without changing apostrophes. */
export function esc(text, context = 'attribute') {
  const pattern = context === 'text' ? /[&<>]/g : context === 'full' ? /[&<>"]/g : /[&<"]/g
  return text.replace(pattern, (char) => entities[char])
}
