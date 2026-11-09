import {
  changedNode,
  ownerOf,
  patchItem,
  pin,
  relevant,
  scan,
  SELECTOR,
  type Retained,
} from './source-context/pin'

export interface SourceContext {
  /** Stop observing before incoming setup; keep controls pinned until the swap. */
  stop(): void
  release(): void
}

type Original = (...args: unknown[]) => unknown

const active = new WeakSet<Document>()
const EVENTS = ['pointerdown', 'click', 'auxclick', 'submit']
const AFTER = ['click', 'auxclick', 'submit']

function install(
  c: Retained,
  target: object,
  name: string,
  make: (d: PropertyDescriptor) => PropertyDescriptor,
  required = true,
) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name)
  if (!descriptor) {
    if (required) throw new Error('Missing control hook')
    return
  }
  if (!descriptor.configurable) throw new Error('Locked control hook')
  const replacement = make(descriptor)
  Object.defineProperty(target, name, replacement)
  c.wrappers.push({ target, name, descriptor, replacement })
}

function restore(c: Retained) {
  for (const { target, name, descriptor, replacement } of c.wrappers.reverse()) {
    const now = Object.getOwnPropertyDescriptor(target, name)
    if (
      now &&
      now.get === replacement.get &&
      now.set === replacement.set &&
      now.value === replacement.value &&
      now.writable === replacement.writable &&
      now.enumerable === replacement.enumerable &&
      now.configurable === replacement.configurable
    )
      Object.defineProperty(target, name, descriptor)
  }
}

function wrapMethods(
  c: Retained,
  target: object,
  names: string[],
  make: (name: string, original: Original) => Original,
) {
  for (const name of names)
    install(c, target, name, (descriptor) => ({
      ...descriptor,
      value: make(name, descriptor.value as Original),
    }))
}

function hookAttributes(c: Retained) {
  install(c, c.win.Element.prototype, 'attributes', (descriptor) => ({
    ...descriptor,
    get(this: Element) {
      // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
      const map = Reflect.apply(descriptor.get!, this, []) as NamedNodeMap
      if (!c.stopped) c.owners.set(map, this)
      return map
    },
  }))
}

function hookValues(c: Retained) {
  const { win, root } = c
  for (const [prototype, property] of [
    [win.Attr.prototype, 'value'],
    [win.Node.prototype, 'nodeValue'],
    [win.Node.prototype, 'textContent'],
  ] as const) {
    install(c, prototype, property, (descriptor) => ({
      ...descriptor,
      set(this: Node, value: string | null) {
        if (!c.stopped && this instanceof win.Attr && this.namespaceURI === null) {
          const item = this.ownerElement,
            name = this.localName.toLowerCase()
          if (item && root.contains(item) && relevant(item, name)) {
            // oxlint-disable-next-line typescript/no-unnecessary-type-conversion -- a DOM setter can receive null at runtime
            const raw = property === 'value' ? value : String(value ?? '')
            value = pin(c, item, name, raw, true)
          }
        }
        // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
        Reflect.apply(descriptor.set!, this, [value])
      },
    }))
  }
}

function hookNamedNodeMap(c: Retained) {
  const { win } = c
  const names = ['setNamedItem', 'setNamedItemNS', 'removeNamedItem', 'removeNamedItemNS']
  wrapMethods(
    c,
    win.NamedNodeMap.prototype,
    names,
    (method, original) =>
      function (this: NamedNodeMap, ...args: unknown[]) {
        const added = method.startsWith('set')
        const owner = !c.stopped && !added ? ownerOf(c, this) : c.owners.get(this)
        const result = Reflect.apply(original, this, args) as Attr | null
        const attr = added ? args[0] : result
        const item = owner ?? (attr instanceof win.Attr ? attr.ownerElement : null)
        changedNode(c, item, attr, added, result)
        return result
      },
  )
}

function hookAttributeNodes(c: Retained) {
  const names = ['setAttributeNode', 'setAttributeNodeNS', 'removeAttributeNode']
  wrapMethods(
    c,
    c.win.Element.prototype,
    names,
    (method, original) =>
      function (this: Element, ...args: unknown[]) {
        const result = Reflect.apply(original, this, args) as Attr | null
        const added = method !== 'removeAttributeNode'
        changedNode(c, this, added ? args[0] : result, added, result)
        return result
      },
  )
}

function hookAttributeMethods(c: Retained) {
  const names = ['setAttribute', 'removeAttribute', 'setAttributeNS', 'removeAttributeNS']
  wrapMethods(
    c,
    c.win.Element.prototype,
    names,
    (name, original) =>
      function (this: Element, ...args: unknown[]) {
        const namespaced = name.endsWith('NS')
        const key = String(args[namespaced ? 1 : 0])
        const attr = key.toLowerCase()
        const local = !namespaced || args[0] === null || args[0] === ''
        if (!c.stopped && local && c.root.contains(this) && relevant(this, attr)) {
          const raw = name.startsWith('remove') ? null : String(args[namespaced ? 2 : 1])
          const value = pin(c, this, attr, raw, true)
          if (value === null) return Reflect.apply(c.nativeRemove, this, [key])
          return Reflect.apply(c.nativeSet, this, [key, value])
        }
        return Reflect.apply(original, this, args)
      },
  )
}

function hookReflected(c: Retained) {
  const { win } = c
  for (const [prototype, property, attr] of [
    [win.HTMLAnchorElement.prototype, 'href', 'href'],
    [win.HTMLFormElement.prototype, 'action', 'action'],
    [win.HTMLButtonElement.prototype, 'formAction', 'formaction'],
    [win.HTMLInputElement.prototype, 'formAction', 'formaction'],
  ] as const) {
    install(
      c,
      prototype,
      property,
      (descriptor) => ({
        ...descriptor,
        set(this: Element, value: string) {
          const next = !c.stopped && c.root.contains(this) ? pin(c, this, attr, value, true) : value
          // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
          Reflect.apply(descriptor.set!, this, [next])
        },
      }),
      false,
    )
  }
}

function hookSubmit(c: Retained) {
  wrapMethods(
    c,
    c.win.HTMLFormElement.prototype,
    ['submit', 'requestSubmit'],
    (_, original) =>
      function (this: HTMLFormElement, ...args: unknown[]) {
        if (!c.stopped && c.root.contains(this)) {
          patchItem(c, this)
          if (args[0] instanceof Element && c.root.contains(args[0])) patchItem(c, args[0])
        }
        return Reflect.apply(original, this, args)
      },
  )
}

function observe(c: Retained, doc: Document) {
  const { root } = c
  const activate = (event: Event) => {
    for (const item of event.composedPath())
      if (item instanceof Element && root.contains(item)) patchItem(c, item)
    if ('submitter' in event) {
      const submitter = (event as SubmitEvent).submitter
      if (submitter && root.contains(submitter)) patchItem(c, submitter)
    }
  }
  for (const type of EVENTS) doc.addEventListener(type, activate, true)
  for (const type of AFTER) doc.addEventListener(type, activate)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (
        record.type === 'attributes' &&
        record.target instanceof Element &&
        root.contains(record.target)
      )
        patchItem(c, record.target)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element) || !root.contains(node)) continue
        if (node.matches(SELECTOR)) patchItem(c, node)
        scan(c, node)
      }
    }
  })
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['href', 'action', 'formaction'],
  })
  return () => {
    observer.disconnect()
    for (const type of EVENTS) doc.removeEventListener(type, activate, true)
    for (const type of AFTER) doc.removeEventListener(type, activate)
  }
}

/** Keep retained controls on their committed URL without changing the document base. */
export function retainSourceContext(
  doc: Document,
  source: string,
  base: string,
): SourceContext | null {
  const root = doc.getElementById('app') ?? doc.body
  const win = doc.defaultView
  if (!root || !win || active.has(doc)) return null
  const c: Retained = {
    root,
    win,
    source,
    base,
    saved: new Map(),
    owners: new WeakMap(),
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    nativeSet: win.Element.prototype.setAttribute,
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    nativeRemove: win.Element.prototype.removeAttribute,
    // oxlint-disable-next-line typescript/unbound-method -- the native setter is kept to be called with .call()
    attrValue: Object.getOwnPropertyDescriptor(win.Attr.prototype, 'value')?.set,
    stopped: false,
    wrappers: [],
  }
  try {
    hookAttributes(c)
    hookValues(c)
    hookNamedNodeMap(c)
    hookAttributeNodes(c)
    hookAttributeMethods(c)
    hookReflected(c)
    hookSubmit(c)
  } catch {
    restore(c)
    return null
  }
  active.add(doc)
  scan(c, root)
  const unobserve = observe(c, doc)
  const stop = () => {
    if (c.stopped) return
    c.stopped = true
    active.delete(doc)
    unobserve()
    restore(c)
  }
  let released = false
  return {
    stop,
    release() {
      if (released) return
      released = true
      stop()
      for (const [item, records] of c.saved)
        for (const [name, action] of records) {
          if (item.getAttribute(name) !== action.installed) continue
          if (action.original === null) item.removeAttribute(name)
          else item.setAttribute(name, action.original)
        }
    },
  }
}
