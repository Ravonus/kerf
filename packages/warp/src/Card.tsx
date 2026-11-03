import { untrack } from '@weft-js/core'
import type { Interaction } from '@weft-js/core/interaction'
import { useUi } from './use-ui'
import './styles'
import '@weft-js/warp-core/styles/components/surface.css'

/**
 * A surface (05 §1, §6: Card, Panel). Interactive cards (`href` or `onClick`) are links or buttons and always carry
 * the sweep at every stop; static ones carry `data-sweep="surface"`, which only `data-flair="sweep"` shows.
 */
export function Card({ eyebrow, title, href, onClick, sweep = true, ui, ref, children, ...rest }: { ref?: ((el: HTMLElement) => void) | undefined; eyebrow?: unknown; title?: unknown; href?: string; onClick?: ((e: MouseEvent) => void) | undefined; sweep?: boolean; ui?: Interaction; children?: unknown; [attr: string]: unknown }) {
  let host: HTMLElement | undefined
  const took = (n: HTMLElement) => { host = n; ref?.(n) }
  useUi(() => ui, () => host)
  const interactive = untrack(() => !!(href || onClick))
  const swept = untrack(() => sweep)
  const parts = () => (
    <>
      {eyebrow !== undefined && <span data-part="eyebrow">{eyebrow}</span>}
      {title !== undefined && <span data-part="title">{title}</span>}
      {children}
      {swept && <span data-part="sweep" aria-hidden="true"></span>}
    </>
  )
  const sweepAttr = swept ? (interactive ? '' : 'surface') : undefined
  if (untrack(() => href)) return <a href={href} data-scope="surface" data-sweep={sweepAttr} onClick={onClick!} {...rest} ref={took}>{parts()}</a>
  if (interactive) return <button type="button" data-scope="surface" data-sweep={sweepAttr} onClick={onClick!} {...rest} ref={took}>{parts()}</button>
  return <div data-scope="surface" data-sweep={sweepAttr} {...rest} ref={took}>{parts()}</div>
}
