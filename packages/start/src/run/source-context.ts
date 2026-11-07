interface SavedAction {
  name: 'action' | 'formaction'
  original: string | null
  installed: string
}

/** Keep retained controls resolving against their committed document until the swap. */
export function retainSourceContext(doc: Document, source: string, base: string) {
  const element = doc.createElement('base')
  element.setAttribute('data-weft-source-base', '')
  element.href = base
  doc.head.insertBefore(element, doc.head.firstChild)
  const saved = new Map<Element, SavedAction>()
  const patch = (item: Element) => {
    const name = item.localName === 'form' ? 'action' : 'formaction'
    const value = item.getAttribute(name)
    if (value === source && saved.has(item)) return
    if ((value === null && name === 'action') || value === '') {
      saved.set(item, { name, original: value, installed: source })
      item.setAttribute(name, source)
    } else saved.delete(item)
  }
  const selector = 'form,button[formaction],input[formaction]'
  const scan = (root: ParentNode) => {
    for (const item of root.querySelectorAll(selector)) patch(item)
  }
  scan(doc)
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes' && record.target instanceof Element) patch(record.target)
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches(selector)) patch(node)
        scan(node)
      }
    }
    if (doc.head.querySelector('base[href]') !== element)
      doc.head.insertBefore(element, doc.head.firstChild)
  })
  observer.observe(doc, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['action', 'formaction'] })
  let released = false
  return () => {
    if (released) return
    released = true
    observer.disconnect()
    for (const [item, action] of saved) {
      if (item.getAttribute(action.name) !== action.installed) continue
      if (action.original === null) item.removeAttribute(action.name)
      else item.setAttribute(action.name, action.original)
    }
    element.remove()
  }
}
