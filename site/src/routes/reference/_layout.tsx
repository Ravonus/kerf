import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import '../../styles/docs.css'

/** Each page draws its own SideNav: a layout's params leave out a catch-all's, so only the page knows its slug. */
export default function ReferenceLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      {props.children}
    </div>
  )
}
