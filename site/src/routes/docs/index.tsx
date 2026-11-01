import { Link, type Meta } from '@weft/start'
import nav from '../../generated/docs-nav.json'

export const prerender = true
export const meta: Meta = { title: 'Docs', description: 'How weft works: the rules, the full stack, warp, diagnostics and what agents read.' }

export default function DocsHome() {
  return (
    <article data-site="doc" data-home="">
      <header><h1>Docs</h1><p data-part="lede">The same pages <code data-scope="code">weft docs</code> prints in a terminal. Press <kbd data-scope="kbd">/</kbd> to search them.</p></header>
      <div data-part="cards">
        {nav.map(group => (
          <section key={group.section}>
            <h2>{group.section}</h2>
            <ul>{group.items.map(i => <li key={i.slug}><Link href={`/docs/${i.slug}`}>{i.title}</Link></li>)}</ul>
          </section>
        ))}
      </div>
    </article>
  )
}
