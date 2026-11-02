import type { RouteProps } from '@weft/start'
import '@weft/warp-core/styles/rich/prose.css'
import '@weft/warp-core/styles/rich/codeblock.css'
import '@weft/warp-core/styles/rich/props.css'
import '@weft/warp-core/styles/components/copy.css'
import { SideNav } from '../../components/SideNav'
import nav from '../../generated/toolkit-nav.json'
import '../../styles/docs.css'
import '../../styles/toolkit.css'

const groups = [{ title: 'Toolkit', items: [{ href: '/toolkit', label: 'All components' }] }, ...nav.map(g => ({ title: g.group, items: g.items.map(i => ({ href: `/toolkit/${i.slug}`, label: i.name })) }))]

export default function ToolkitLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      <SideNav label="Components" groups={groups} />
      {props.children}
    </div>
  )
}
