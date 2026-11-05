// ---- events ---------------------------------------------------------------------------------------------------

/** A node as delegation reads it: its handlers sit on it under `_$$<event>`. */
type Listening = Node & { disabled?: boolean } & Record<string, unknown>

const delegated = new Set<string>()

function dispatch(e: Event) {
  const key = `_$$${e.type}`
  let node = e.target as Listening | null
  Object.defineProperty(e, 'currentTarget', { configurable: true, get: () => node || document })
  while (node) {
    const handler = node[key] as ((...args: unknown[]) => void) | undefined
    if (handler && !node.disabled) {
      const data = node[`${key}Data`]
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e)
      if (e.cancelBubble) return
    }
    node = node.parentNode as Listening | null
  }
}

/** Puts one document listener behind each of `names`; handlers then sit on their nodes. */
export function delegateEvents(names: string[]) {
  for (const name of names) {
    if (delegated.has(name)) continue
    delegated.add(name)
    document.addEventListener(name, dispatch)
  }
}

/** `onX={handler}`, read once: delegated when the event is. `[fn, data]` calls `fn(data, event)`. */
export function addEvent(node: Element, name: string, handler: unknown, delegate?: boolean) {
  if (!delegate)
    return node.addEventListener(
      name,
      Array.isArray(handler) ? (e: Event) => handler[0](handler[1], e) : (handler as EventListener),
    )
  const key = `_$$${name}`
  if (Array.isArray(handler)) {
    ;(node as unknown as Listening)[key] = handler[0]
    ;(node as unknown as Listening)[`${key}Data`] = handler[1]
  } else (node as unknown as Listening)[key] = handler
}
