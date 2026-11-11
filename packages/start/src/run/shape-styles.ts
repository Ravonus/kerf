interface SheetLease {
  release(): void
}

interface SheetEntry {
  element: HTMLStyleElement
  count: number
}

const sheets = new WeakMap<Document, Map<string, SheetEntry>>()

function hasImports(rules: CSSRuleList): boolean {
  for (const rule of Array.from(rules)) {
    if (rule.type === 3) return true
    if ('cssRules' in rule && hasImports((rule as CSSGroupingRule).cssRules)) return true
  }
  return false
}

/** Apply provided shape CSS before app styles. A lease owns only the styles it creates. */
export function acquireShapeStyles(
  doc: Document,
  build: string | null | undefined,
  text: string[],
): SheetLease | null {
  if (!doc.head || text.some((css) => /@import\b/i.test(css))) return null
  const key = JSON.stringify([build ?? null, text])
  const entries = sheets.get(doc) ?? new Map<string, SheetEntry>()
  if (!sheets.has(doc)) sheets.set(doc, entries)
  let entry = entries.get(key)
  if (entry && entry.element.parentNode !== doc.head) {
    entries.delete(key)
    entry = undefined
  }
  if (!entry) {
    const element = doc.createElement('style')
    element.setAttribute('data-kerf-shape-style', '')
    const nonce = doc.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.nonce
    if (nonce) element.nonce = nonce
    element.textContent = text.join('\n')
    const owned = new Set<Element>([...entries.values()].map((item) => item.element))
    const appStyle =
      [...doc.head.querySelectorAll('style,link[rel~="stylesheet"]')].find(
        (item) => !owned.has(item),
      ) ?? null
    try {
      doc.head.insertBefore(element, appStyle)
      if (!element.sheet || hasImports(element.sheet.cssRules)) {
        element.remove()
        return null
      }
    } catch {
      element.remove()
      return null
    }
    entry = { element, count: 0 }
    entries.set(key, entry)
  }
  entry.count++
  const owned = entry
  let released = false
  return {
    release() {
      if (released) return
      released = true
      if (--owned.count === 0) {
        owned.element.remove()
        if (entries.get(key) === owned) entries.delete(key)
      }
    },
  }
}
