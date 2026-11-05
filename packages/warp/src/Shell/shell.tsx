import '../styles'
import '@weft-js/warp-core/styles/components/avatar.css'
import '@weft-js/warp-core/styles/components/button.css'
import '@weft-js/warp-core/styles/components/menu.css'
import '@weft-js/warp-core/styles/layout/tokens.css'
import '@weft-js/warp-core/styles/layout/base.css'
import '@weft-js/warp-core/styles/layout/shell.css'
import '@weft-js/warp-core/styles/layout/breadcrumb.css'
import { untrack } from '@weft-js/core'
import type { ShellProps } from './shared'
import { shellState } from './state'
import { shellFrame } from './view'

/**
 * The app shell (02 §5-6; layout.html:874-906): one element tree, three presentations, chosen by the shell's own
 * width: phone a top bar and bottom tabs, tablet a rail that opens as an overlay, desktop a sidebar that collapses to
 * the rail (`[`). DOM order is the focus order: skip link, brand, back, crumbs, command, actions, account, nav items,
 * foot, main, dock. Parts are props, not children, so that order and the overlays' place outside main hold whatever
 * an app passes. The account menu is an APG menu button; the More sheet is modal on a native <dialog>.
 */
export function Shell(props: ShellProps) {
  const view = shellState(untrack(() => props))
  const page = <div data-part="page">{props.children}</div>
  return shellFrame(view, page)
}
