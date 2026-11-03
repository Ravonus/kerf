import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '@weft-js/warp'
import { referenceSections, SITE_LINKS, SITE_NAV_ID } from '../../lib/sections'
import '../../styles/docs.css'

/** The rail marks the page showing: a layout's params are its page's, the catch-all's `slug` included. */
export default function ReferenceLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      <SideNav id={SITE_NAV_ID} lead={SITE_LINKS} label="Reference" sections={referenceSections} current={props.params.slug ? `/reference/${props.params.slug}` : '/reference'} filter remember="weft:site:reference" />
      {props.children}
    </div>
  )
}
