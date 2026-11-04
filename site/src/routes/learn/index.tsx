import { Link, type Meta, type RouteProps } from '@weft-js/start'
import { LearnDemo } from '../../components/LearnDemo'
import nav from '../../generated/learn-nav.json'
import pages from '../../generated/learn.json'

const all = pages as unknown as Record<string, { description: string }>

/** The opening demo's source, highlighted at build time, so it isn't in the page's script. */
export const load = async () => {
  const { default: code } = await import('../../generated/demos.json')
  return { code: (code as Record<string, string>)['getting-started'] ?? '' }
}
export const prerender = true
export const meta: Meta = {
  title: 'Learn',
  description:
    'Learn weft from the first component to the server: chapters in order, each with live examples.',
}

export default function LearnHome(props: RouteProps<typeof load>) {
  return (
    <article data-site="doc" data-vt="main" data-learn-home="">
      <header>
        <h1>Learn weft</h1>
        <p data-part="lede">
          weft is TSX that compiles to direct DOM updates. A component runs once, state is a box
          with a <code data-scope="code">.value</code>, and the compiler names each mistake with a
          code and a fix. These chapters go from your first component to the server, in order.
        </p>
      </header>

      <section data-site="quick-start">
        <h2 id="quick-start">Quick start</h2>
        <p>Once weft is on npm, one command makes an app:</p>
        <pre data-part="cmd">
          <code>npm create @weft-js</code>
        </pre>
        <p>
          weft isn't on npm yet. For now, run this from a checkout of the repo.{' '}
          <Link href="/learn/installation">Installation</Link> has every step, and{' '}
          <Link href="/learn/quick-start">Quick start</Link> tours the main ideas in a few minutes.
        </p>
        <pre data-part="cmd">
          <code>node packages/create-weft/scripts/local.mjs new my-app</code>
        </pre>
        <p>
          A component is a function that returns TSX. This one keeps a count in{' '}
          <code data-scope="code">state</code> and shows it. The code is the code running beside it.
        </p>
        <section data-site="example" data-learn="">
          <div data-part="pair">
            <LearnDemo id="getting-started" />
            <div
              data-scope="codeblock"
              // oxlint-disable-next-line weft/no-html-sink -- highlighted at build time from this repo's demos
              innerHTML={props.data.code}
            ></div>
          </div>
          <p data-part="try">
            <strong>Try this:</strong> Press Add to cart. Only the badge's text changes:{' '}
            <code data-scope="code">Product</code> itself never runs again.
          </p>
        </section>
      </section>

      <section data-site="chapters">
        <h2 id="chapters">Chapters</h2>
        <ol data-part="path">
          {nav.map((g, n) => (
            <li key={g.section}>
              <span data-part="n" aria-hidden="true">
                {n + 1}
              </span>
              <div>
                <h3>
                  <Link href={`/learn/${g.overview ?? g.items[0]!.slug}`}>{g.section}</Link>
                </h3>
                <p>{all[g.overview ?? g.items[0]!.slug]?.description}</p>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.slug}>
                      <Link href={`/learn/${i.slug}`}>{i.title}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
        <p>
          Looking for an exact API, a command or a diagnostic code? That is in{' '}
          <Link href="/reference">Reference</Link>.
        </p>
      </section>
    </article>
  )
}
