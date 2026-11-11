import { Link, type Meta } from '@kerf-js/start'
import nav from '../../generated/reference-nav.json'
import { ArtStage } from '../../toolkit/art/stage'
import '../../styles/art.css'

const ART = ['woven-word', 'tide-table', 'bobbin', 'survey', 'moire-loom', 'caustics']

export const prerender = true
export const meta: Meta = {
  title: 'Reference',
  description:
    'The exact API: the rules, props, the full stack, styling, configuration, diagnostics and what agents read.',
}

export default function ReferenceHome() {
  return (
    <article data-site="doc" data-home="">
      <header>
        <h1>Reference</h1>
        <p data-part="lede">
          Exact APIs, commands, config keys and diagnostic codes. The same pages{' '}
          <code data-scope="code">kerf docs</code> prints in a terminal. New to kerf? Start with{' '}
          <Link href="/learn">Learn</Link>.
        </p>
      </header>
      <div data-part="cards">
        {nav.map((group, n) => (
          <section key={group.section} data-flow="card">
            <div data-part="thumb">
              <ArtStage id={ART[n % ART.length]!} />
            </div>
            <h2>{group.section}</h2>
            <ul>
              {group.items.map((i) => (
                <li key={i.slug}>
                  <Link href={`/reference/${i.slug}`}>{i.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  )
}
