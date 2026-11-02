import { Link, type RouteProps } from '@weft-js/start'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/rich/props.css'
import '@weft-js/warp-core/styles/components/copy.css'
import nav from '../../generated/toolkit-nav.json'
import '../../styles/docs.css'
import '../../styles/toolkit.css'

export default function ToolkitLayout(props: RouteProps) {
  return (
    <div data-site="docs" data-wide="">
      <details data-site="doc-nav" open>
        <summary>Components</summary>
        <nav aria-label="Components">
          {nav.map(group => (
            <div key={group.group}>
              <h2>{group.group}</h2>
              <ul>{group.items.map(i => <li key={i.slug}><Link href={`/toolkit/${i.slug}`}>{i.name}</Link></li>)}</ul>
            </div>
          ))}
        </nav>
      </details>
      {props.children}
    </div>
  )
}
