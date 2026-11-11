// Peer tags shown beside shared form controls.
import { peerColor } from './collab-peer'
import type { FormOp } from './collab'

export function formTag(form: HTMLFormElement, doc: Document) {
  const rootOf = (el: Element) =>
    el.closest<HTMLElement>('[data-scope="field"], [data-scope="switch"]') ?? (el as HTMLElement)
  const tagOf = (op: FormOp, el: Element) => {
    const root = rootOf(el)
    let tag = form.querySelector<HTMLElement>(`[data-tag="${op.name}"]`)
    if (!tag) {
      tag = doc.createElement('span')
      tag.dataset.part = 'peer-tag'
      tag.dataset.tag = op.name
      root.after(tag)
    }
    tag.dataset.presenceColor = String(peerColor(op.peer))
    tag.hidden = false
    return tag
  }
  return { rootOf, tagOf }
}
