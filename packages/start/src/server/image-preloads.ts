// Critical pictures must compete before the module graph, using the browser's actual responsive source.
import { decode } from '../derive.mjs'
import { esc } from './text'
type Attributes = Record<string, string>
const attributes = (text: string): Attributes =>
  Object.fromEntries(
    [...text.matchAll(/\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(
      ([, key, a, b, c]) => [key!.toLowerCase(), decode(a ?? b ?? c ?? '')],
    ),
  )
const web = (value: string) => {
  try {
    return /^https?:$/.test(new URL(value, 'https://kerf.invalid/').protocol)
  } catch {
    return false
  }
}
function link(source: Attributes, media = '') {
  const href = source.src ?? source.srcset?.split(',')[0]?.trim().split(/\s+/)[0]
  if (!href || !web(href)) return ''
  return (
    '<link rel="preload" as="image" fetchpriority="high"' +
    Object.entries({
      href,
      type: source.type,
      imagesrcset: source.srcset,
      imagesizes: source.sizes,
      media,
    })
      .filter(([, value]) => value)
      .map(([key, value]) => ` ${key}="${esc(value!)}"`)
      .join('') +
    '>\n'
  )
}
/** Preload at most two eager priority images; inert markup and scripts never supply resource hints. */
export function imagePreloads(html: string) {
  const clean = html
    .replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
  let picture: Attributes[] | undefined,
    count = 0
  const links = new Set<string>()
  for (const [, closing, tag, text] of clean.matchAll(
    /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g,
  )) {
    const name = tag!.toLowerCase()
    if (name === 'picture') {
      picture = closing ? undefined : []
      continue
    }
    if (closing) continue
    if (name === 'source' && picture) {
      picture.push(attributes(text!))
      continue
    }
    if (name !== 'img') continue
    const image = attributes(text!)
    if (
      image.fetchpriority?.toLowerCase() !== 'high' ||
      image.loading?.toLowerCase() === 'lazy' ||
      count >= 2
    )
      continue
    count++
    if (!picture?.length) {
      const hint = link(image)
      if (hint) links.add(hint)
      continue
    }
    const groups = new Map<string, Attributes>()
    for (const source of picture)
      if (source.srcset && !groups.has(source.media ?? '')) groups.set(source.media ?? '', source)
    const directed = [...groups.keys()].filter(Boolean)
    for (const [query, source] of groups) {
      // A feature-only media query can be complemented without requesting both art directions.
      let media = query
      if (!media && directed.length) {
        if (directed.length !== 1 || !directed[0]!.startsWith('(') || directed[0]!.includes(','))
          continue
        media = 'not all and ' + directed[0]
      }
      const sizes = source.sizes ?? image.sizes
      const hint = link({ ...source, ...(sizes ? { sizes } : {}) }, media)
      if (hint) links.add(hint)
    }
  }
  return [...links].join('')
}
