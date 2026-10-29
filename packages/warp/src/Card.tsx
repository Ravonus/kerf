import { installSweep } from '@weft/ui-core'
import { onMount, untrack } from 'weft'
import './styles'
import '@weft/ui-core/styles/components/surface.css'

/**
 * A surface (05 §1, §6: Card, Panel). Interactive cards (`href` or `onClick`) are links or buttons and always carry
 * the sweep; static ones carry `data-sweep="surface"`, which the dial shows only at vivid (`--warp-sweep-surfaces`).
 */
export function Card({ eyebrow, title, href, onClick, sweep = true, children, ...rest }: { eyebrow?: any; title?: any; href?: string; onClick?: (e: MouseEvent) => void; sweep?: boolean; children?: any; [attr: string]: any }) {
  onMount(() => installSweep())
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
  if (untrack(() => href)) return <a href={href} data-scope="surface" data-sweep={sweepAttr} data-phase={swept ? 'idle' : undefined} onClick={onClick} {...rest}>{parts()}</a>
  if (interactive) return <button type="button" data-scope="surface" data-sweep={sweepAttr} data-phase={swept ? 'idle' : undefined} onClick={onClick} {...rest}>{parts()}</button>
  return <div data-scope="surface" data-sweep={sweepAttr} data-phase={swept ? 'idle' : undefined} {...rest}>{parts()}</div>
}
