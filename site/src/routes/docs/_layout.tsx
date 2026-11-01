import { Link, type RouteProps } from '@weft/start'
import '@weft/ui-core/styles/rich/prose.css'
import '@weft/ui-core/styles/rich/codeblock.css'
import '@weft/ui-core/styles/components/copy.css'
import nav from '../../generated/docs-nav.json'
import '../../styles/docs.css'

/** The docs' side nav: links only, so it ships nothing. On a phone it folds into a disclosure. */
export default function DocsLayout(props: RouteProps) {
  return (
    <div data-site="docs">
      <details data-site="doc-nav" open>
        <summary>Menu</summary>
        <nav aria-label="Docs">
          {nav.map(group => (
            <div key={group.section}>
              <h2>{group.section}</h2>
              <ul>{group.items.map(i => <li key={i.slug}><Link href={`/docs/${i.slug}`}>{i.title}</Link></li>)}</ul>
            </div>
          ))}
        </nav>
      </details>
      {props.children}
    </div>
  )
}
