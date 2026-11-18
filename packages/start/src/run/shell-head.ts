// Keep data-driven metadata within inert head elements and attributes.
import { setHead } from '@kerf-js/core/head'
import type { Extra, Merged } from '@kerf-js/core/ssr'
import { isRouteUrl } from '../shell'
import { record } from '../shell/wire'

const linkRelations = new Set([
  'alternate',
  'author',
  'canonical',
  'help',
  'license',
  'next',
  'prev',
])

function extraTags(entries: readonly Extra[], origins: readonly string[]): Extra[] {
  const tags: Extra[] = []
  for (const entry of entries) {
    if (!record(entry)) continue
    if ('rel' in entry) {
      if (linkRelations.has(entry.rel) && isRouteUrl(entry.href, origins))
        tags.push({ rel: entry.rel, href: entry.href })
    } else if (typeof entry.content === 'string') {
      if ('name' in entry && typeof entry.name === 'string' && passiveMetaName(entry.name))
        tags.push({ name: entry.name, content: entry.content })
      else if ('property' in entry && typeof entry.property === 'string')
        tags.push({ property: entry.property, content: entry.content })
    }
  }
  return tags
}

function passiveMetaName(name: string) {
  return !['referrer', 'viewport'].includes(name.trim().toLowerCase())
}

/** Write shell metadata with fixed attributes and a release-owned canonical origin. */
export function applyShellHead(head: Merged, pathname: string) {
  const base = head.url && URL.parse(head.url)
  const origins = base ? [base.origin] : []
  setHead({ ...head, extra: extraTags(head.extra, origins) }, pathname)
  if (!head.jsonLd) return
  const data = document.createElement('script')
  data.type = 'application/ld+json'
  data.setAttribute('data-wm', '')
  data.textContent = JSON.stringify(head.jsonLd)
  document.head.append(data)
}
