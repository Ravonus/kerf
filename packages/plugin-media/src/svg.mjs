// M012 (research 15 §7.5): SVG content that can run code or fetch something, which an image must not carry.

const RULES = [
  [/<script[\s>/]/i, '<script>'],
  [/<foreignObject[\s>/]/i, '<foreignObject>'],
  [/\son[a-z]+\s*=/i, 'an on* event handler'],
  [/\s(?:xlink:)?href\s*=\s*["'](?!#|data:)[^"']/i, 'an external href'],
  [/url\(\s*['"]?(?!#|data:)[a-z]+:/i, 'an external url()'],
  [/@import\b/i, 'a CSS @import'],
]

/** What makes this SVG unsafe as an image, or [] when nothing does. */
export function unsafeSvg(text) {
  return RULES.filter(([re]) => re.test(text)).map(([, what]) => what)
}
