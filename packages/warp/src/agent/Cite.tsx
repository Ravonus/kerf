import { citePreview, installSweep, type AgentSource } from '@weft-js/warp-core'
import { state } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import '../styles'
import '@weft-js/warp-core/styles/components/popover.css'
import '@weft-js/warp-core/styles/app/cite.css'

/**
 * A citation (07 §1.3, §1.6): a link to source n named "Source n", with a preview on hover and focus. The preview sits
 * next in the DOM, so Tab reaches its link. Pressing moves focus to the source card and confirms it.
 */
export function Cite({ n, source, href }: { n: number; source?: AgentSource; href: string }) {
  const open = state(false)
  let link: HTMLAnchorElement | undefined
  let panel: HTMLElement | undefined
  use(citePreview, () => (source ? link : undefined), () => ({ panel: panel!, onOpen: (o: boolean) => (open.value = o) }))
  const jump = (e: MouseEvent) => {
    const a = e.currentTarget as Element
    const doc = a.ownerDocument
    const card = doc.getElementById(a.getAttribute('href')!.slice(1)) // the page's id: a hydrated server id isn't this side's
    if (!card) return
    e.preventDefault()
    card.focus()
    installSweep(doc).confirm(card)
  }
  return (
    <span style="display:contents">
      <a ref={(n: any) => (link = n)} href={href} data-scope="cite" aria-label={`Source ${n}`} aria-expanded={source ? (open.value ? 'true' : 'false') : undefined} onClick={jump}>{n}</a>
      {source && (
        <span ref={(n: any) => (panel = n)} data-scope="popover" data-part="content" popover="manual">
          <span data-part="title" style="display:block">{source.title}</span>
          {source.path !== undefined && <span data-part="description" style="display:block">{source.path}</span>}
          {source.snippet !== undefined && <span>{source.snippet}</span>}
          {source.url !== undefined && <a href={source.url} data-part="open">Open source</a>}
        </span>
      )}
    </span>
  )
}
