export type Name = 'href' | 'action' | 'formaction'
export interface Saved {
  original: string | null
  installed: string
}

export interface Wrapper {
  target: object
  name: string
  descriptor: PropertyDescriptor
  replacement: PropertyDescriptor
}

export interface Retained {
  root: HTMLElement
  win: Window & typeof globalThis
  source: string
  base: string
  saved: Map<Element, Map<Name, Saved>>
  owners: WeakMap<NamedNodeMap, Element>
  nativeSet: Element['setAttribute']
  nativeRemove: Element['removeAttribute']
  attrValue: PropertyDescriptor['set']
  stopped: boolean
  wrappers: Wrapper[]
}

export const SELECTOR = 'a[href],form,button[formaction],input[formaction]'

export const relevant = (item: Element, name: string): name is Name =>
  (item.localName === 'a' && name === 'href') ||
  (item.localName === 'form' && name === 'action') ||
  ((item.localName === 'button' || item.localName === 'input') && name === 'formaction')

export function pin(
  c: Retained,
  item: Element,
  name: Name,
  raw: string | null,
  force = false,
): string | null {
  const records = c.saved.get(item)
  if (!force && records?.get(name)?.installed === raw) return raw
  if (raw === null && name !== 'action') {
    records?.delete(name)
    return null
  }
  // Absolute and root-relative URLs resolve the same from any path: leave them alone.
  if (raw && raw !== records?.get(name)?.installed && /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(raw)) {
    records?.delete(name)
    return raw
  }
  let resolved: string
  try {
    resolved = name !== 'href' && !raw ? c.source : new URL(raw ?? '', c.base).href
  } catch {
    records?.delete(name)
    return raw
  }
  if (raw === resolved) {
    records?.delete(name)
    return raw
  }
  const own = records ?? new Map<Name, Saved>()
  c.saved.set(item, own)
  own.set(name, { original: raw, installed: resolved })
  return resolved
}

export function patch(c: Retained, item: Element, name: Name) {
  const raw = item.getAttribute(name)
  const resolved = pin(c, item, name, raw)
  if (resolved !== raw) {
    if (resolved === null) Reflect.apply(c.nativeRemove, item, [name])
    else Reflect.apply(c.nativeSet, item, [name, resolved])
  }
}

export function patchItem(c: Retained, item: Element) {
  void item.attributes // Register maps captured before this context began.
  if (item.localName === 'a') patch(c, item, 'href')
  if (item.localName === 'form') patch(c, item, 'action')
  if (item.localName === 'button' || item.localName === 'input') patch(c, item, 'formaction')
}

export function scan(c: Retained, parent: ParentNode) {
  for (const item of parent.querySelectorAll(SELECTOR)) patchItem(c, item)
}

export function ownerOf(c: Retained, map: NamedNodeMap) {
  const known = c.owners.get(map)
  if (known) return known
  if (c.root.matches('a,form,button,input') && c.root.attributes === map) return c.root
  for (const item of c.root.querySelectorAll('a,form,button,input'))
    if (item.attributes === map) return item
  return undefined
}

export function changedNode(
  c: Retained,
  item: Element | null | undefined,
  attr: unknown,
  added: boolean,
  previous: Attr | null,
) {
  if (
    c.stopped ||
    !item ||
    !c.root.contains(item) ||
    !(attr instanceof c.win.Attr) ||
    attr.namespaceURI !== null ||
    !relevant(item, attr.localName.toLowerCase())
  )
    return
  const name = attr.localName.toLowerCase() as Name
  if (added) {
    const raw = attr.value,
      value = pin(c, item, name, raw, previous !== attr)
    if (value !== raw) Reflect.apply(c.attrValue!, attr, [value])
  } else {
    const value = pin(c, item, name, null, true)
    if (value !== null) Reflect.apply(c.nativeSet, item, [name, value])
  }
}
