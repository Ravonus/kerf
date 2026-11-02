import type { RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SideNav } from '../../components/SideNav'
import nav from '../../generated/learn-nav.json'
import '../../styles/docs.css'
import '../../styles/learn.css'

/** The chapters in teaching order, numbered, so the rail reads as a path from the top. */
const groups = [{ title: 'Learn weft', items: [{ href: '/learn', label: 'Overview' }] }, ...nav.map((g, n) => ({ title: `${n + 1}. ${g.section}`, items: g.items.map(i => ({ href: `/learn/${i.slug}`, label: i.title })) }))]

export default function LearnLayout(props: RouteProps) {
  return (
    <div data-site="docs" data-learn="">
      <SideNav label="Learn" groups={groups} />
      {props.children}
    </div>
  )
}
