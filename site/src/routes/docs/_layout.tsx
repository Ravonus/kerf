import { Link, type RouteProps } from '@weft-js/start'
import { Nav } from '@weft-js/warp'
import '@weft-js/warp-core/styles/rich/prose.css'
import '@weft-js/warp-core/styles/rich/codeblock.css'
import '@weft-js/warp-core/styles/components/copy.css'
import { SearchTrigger } from '../../components/SearchTrigger'
import { SpotlightGate } from '../../components/SpotlightGate'
import nav from '../../generated/docs-nav.json'
import '../../styles/docs.css'

export default function DocsLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      <details data-site="doc-nav" data-vt="side" open>
        <summary>Menu</summary>
        <SearchTrigger />
        <Nav label="Docs" axis="y">
          {nav.map(group => (
            <div key={group.section}>
              <h2>{group.section}</h2>
              {group.items.map(i => <Link key={i.slug} href={`/docs/${i.slug}`}>{i.title}</Link>)}
            </div>
          ))}
        </Nav>
      </details>
      {props.children}
      <SpotlightGate />
    </div>
  )
}
