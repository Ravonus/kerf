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
  const prototype = doc.defaultView?.HTMLFormElement.prototype
  if (!root || !prototype || active.has(doc)) return null
  const descriptors = ['submit', 'requestSubmit'].map((name) =>
    [name, Object.getOwnPropertyDescriptor(prototype, name)] as const)
  if (descriptors.some(([, desc]) => !desc?.configurable || typeof desc.value !== 'function'))
    return null
  const saved = new Map<Element, Map<Name, Saved>>()
  const patch = (item: Element, name: Name) => {
    const raw = item.getAttribute(name)
    const records = saved.get(item)
    if (records?.get(name)?.installed === raw) return
    if (raw === null && name !== 'action') { records?.delete(name); return }
    let resolved: string
    try { resolved = name !== 'href' && !raw ? source : new URL(raw ?? '', base).href }
    catch { records?.delete(name); return }
    if (raw === resolved) { records?.delete(name); return }
    const own = records ?? new Map<Name, Saved>()
    saved.set(item, own)
    own.set(name, { original: raw, installed: resolved })
    item.setAttribute(name, resolved)
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
  let stopped = false
  const wrappers: { name: string; descriptor: PropertyDescriptor;
    wrapper: (this: HTMLFormElement, ...args: unknown[]) => unknown }[] = []
  try {
    for (const [name, descriptor] of descriptors) {
      const original = descriptor!.value as (...args: unknown[]) => unknown
      const wrapper = function (this: HTMLFormElement, ...args: unknown[]) {
        if (!stopped && root.contains(this)) {
          patchItem(this)
          if (args[0] instanceof Element && root.contains(args[0])) patchItem(args[0])
        }
        return Reflect.apply(original, this, args)
      }
      Object.defineProperty(prototype, name, { ...descriptor, value: wrapper })
      wrappers.push({ name, descriptor: descriptor!, wrapper })
    }
  } catch {
    for (const { name, descriptor } of wrappers) Object.defineProperty(prototype, name, descriptor)
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
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element &&
          root.contains(record.target))
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
    for (const { name, descriptor, wrapper } of wrappers)
      if (Object.getOwnPropertyDescriptor(prototype, name)?.value === wrapper)
        Object.defineProperty(prototype, name, descriptor)
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
