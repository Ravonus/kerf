type Name = 'href' | 'action' | 'formaction'
interface Saved {
  original: string | null
  installed: string
}

export interface SourceContext {
  /** Stop observing before incoming setup; keep controls pinned until the swap. */
  stop(): void
  release(): void
}

const active = new WeakSet<Document>()

/** Keep retained controls on their committed URL without changing the document base. */
export function retainSourceContext(
  doc: Document, source: string, base: string,
): SourceContext | null {
  const root = doc.getElementById('app') ?? doc.body
  const win = doc.defaultView
  if (!root || !win || active.has(doc)) return null
  const saved = new Map<Element, Map<Name, Saved>>()
  const nativeSet = win.Element.prototype.setAttribute
  const nativeRemove = win.Element.prototype.removeAttribute
  let stopped = false
  const relevant = (item: Element, name: string): name is Name =>
    (item.localName === 'a' && name === 'href') ||
    (item.localName === 'form' && name === 'action') ||
    ((item.localName === 'button' || item.localName === 'input') && name === 'formaction')
  const pin = (item: Element, name: Name, raw: string | null, force = false): string | null => {
    const records = saved.get(item)
    if (!force && records?.get(name)?.installed === raw) return raw
    if (raw === null && name !== 'action') { records?.delete(name); return null }
    let resolved: string
    try { resolved = name !== 'href' && !raw ? source : new URL(raw ?? '', base).href }
    catch { records?.delete(name); return raw }
    if (raw === resolved) { records?.delete(name); return raw }
    const own = records ?? new Map<Name, Saved>()
    saved.set(item, own)
    own.set(name, { original: raw, installed: resolved })
    return resolved
  }
  const patch = (item: Element, name: Name) => {
    const raw = item.getAttribute(name)
    const resolved = pin(item, name, raw)
    if (resolved !== raw) {
      if (resolved === null) Reflect.apply(nativeRemove, item, [name])
      else Reflect.apply(nativeSet, item, [name, resolved])
    }
  }
  const patchItem = (item: Element) => {
    if (item.localName === 'a') patch(item, 'href')
    if (item.localName === 'form') patch(item, 'action')
    if (item.localName === 'button' || item.localName === 'input') patch(item, 'formaction')
  }
  const selector = 'a[href],form,button[formaction],input[formaction]'
  const scan = (parent: ParentNode) => {
    for (const item of parent.querySelectorAll(selector)) patchItem(item)
  }
  const wrappers: { target: object; name: string; descriptor: PropertyDescriptor;
    replacement: PropertyDescriptor }[] = []
  const install = (target: object, name: string, make: (d: PropertyDescriptor) => PropertyDescriptor,
    required = true) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, name)
    if (!descriptor) { if (required) throw new Error('Missing control hook'); return }
    if (!descriptor.configurable) throw new Error('Locked control hook')
    const replacement = make(descriptor)
    Object.defineProperty(target, name, replacement)
    wrappers.push({ target, name, descriptor, replacement })
  }
  const restore = () => {
    for (const { target, name, descriptor, replacement } of wrappers.reverse()) {
      const now = Object.getOwnPropertyDescriptor(target, name)
      if (now?.value === replacement.value && now?.set === replacement.set)
        Object.defineProperty(target, name, descriptor)
    }
  }
  try {
    for (const name of ['setAttribute', 'removeAttribute', 'setAttributeNS', 'removeAttributeNS']) {
      install(win.Element.prototype, name, (descriptor) => {
        const original = descriptor.value as (...args: unknown[]) => unknown
        return { ...descriptor, value: function (this: Element, ...args: unknown[]) {
          const namespaced = name.endsWith('NS')
          const key = String(args[namespaced ? 1 : 0])
          const attr = key.toLowerCase()
          const local = !namespaced || args[0] === null || args[0] === ''
          if (!stopped && local && root.contains(this) && relevant(this, attr)) {
            const raw = name.startsWith('remove') ? null : String(args[namespaced ? 2 : 1])
            const value = pin(this, attr, raw, true)
            if (value === null) return Reflect.apply(nativeRemove, this, [key])
            return Reflect.apply(nativeSet, this, [key, value])
          }
          return Reflect.apply(original, this, args)
        } }
      })
    }
    for (const [prototype, property, attr] of [
      [win.HTMLAnchorElement.prototype, 'href', 'href'],
      [win.HTMLFormElement.prototype, 'action', 'action'],
      [win.HTMLButtonElement.prototype, 'formAction', 'formaction'],
      [win.HTMLInputElement.prototype, 'formAction', 'formaction'],
    ] as const) {
      install(prototype, property, (descriptor) => ({ ...descriptor,
        set: function (this: Element, value: string) {
          const next = !stopped && root.contains(this) ? pin(this, attr, String(value), true) : value
          Reflect.apply(descriptor.set!, this, [next])
        },
      }), false)
    }
    for (const name of ['submit', 'requestSubmit']) {
      install(win.HTMLFormElement.prototype, name, (descriptor) => {
        const original = descriptor.value as (...args: unknown[]) => unknown
        return { ...descriptor, value: function (this: HTMLFormElement, ...args: unknown[]) {
          if (!stopped && root.contains(this)) {
            patchItem(this)
            if (args[0] instanceof Element && root.contains(args[0])) patchItem(args[0])
          }
          return Reflect.apply(original, this, args)
        } }
      })
    }
  } catch {
    restore()
    return null
  }
  active.add(doc)
  scan(root)
  const activate = (event: Event) => {
    for (const item of event.composedPath())
      if (item instanceof Element && root.contains(item)) patchItem(item)
    if ('submitter' in event) {
      const submitter = (event as SubmitEvent).submitter
      if (submitter && root.contains(submitter)) patchItem(submitter)
    }
  }
  for (const type of ['pointerdown', 'click', 'auxclick', 'submit'])
    doc.addEventListener(type, activate, true)
  for (const type of ['click', 'auxclick', 'submit']) doc.addEventListener(type, activate)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element && root.contains(record.target))
        patchItem(record.target)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || !root.contains(node)) continue
        if (node.matches(selector)) patchItem(node)
        scan(node)
      }
    }
  })
  observer.observe(root, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['href', 'action', 'formaction'] })
  const stop = () => {
    if (stopped) return
    stopped = true
    active.delete(doc)
    observer.disconnect()
    for (const type of ['pointerdown', 'click', 'auxclick', 'submit'])
      doc.removeEventListener(type, activate, true)
    for (const type of ['click', 'auxclick', 'submit']) doc.removeEventListener(type, activate)
    restore()
  }
  let released = false
  return { stop, release() {
    if (released) return
    released = true
    stop()
    for (const [item, records] of saved) for (const [name, action] of records) {
      if (item.getAttribute(name) !== action.installed) continue
      if (action.original === null) item.removeAttribute(name)
      else item.setAttribute(name, action.original)
    }
  } }
}
