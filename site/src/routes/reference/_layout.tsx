import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '../../components/SideNav'
import nav from '../../generated/reference-nav.json'
import '../../styles/docs.css'

const groups = nav.map(g => ({ title: g.section, items: g.items.map(i => ({ href: `/reference/${i.slug}`, label: i.title })) }))

export default function ReferenceLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      <SideNav label="Reference" groups={groups} />
      {props.children}
    </div>
  )
}
