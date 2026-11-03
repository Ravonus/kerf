import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '@weft-js/warp'
import { referenceSections } from '../../lib/sections'
import '../../styles/docs.css'

/** A layout's params are its page's, so the catch-all `slug` names the page this rail marks. */
export default function ReferenceLayout(props: RouteProps) {
  const slug = props.params.slug
  return (
    <div data-site="docs">
      <SideNav label="Reference" sections={referenceSections} current={slug ? `/reference/${slug}` : '/reference'} filter remember="weft:site:reference" />
      {props.children}
    </div>
  )
}
