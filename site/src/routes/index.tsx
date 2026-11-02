import { Link, type Meta } from '@weft-js/start'
import { Arena } from '../components/Arena'
import { Example } from '../components/Example'
import numbers from '../generated/numbers.json'
import kit from '../generated/toolkit-nav.json'
import Shop1 from '../demos/shop-1'
import Shop2 from '../demos/shop-2'
import Shop4 from '../demos/shop-4'
import Shop5 from '../demos/shop-5'
import { Fix } from '../components/Fix'
import { ArtStrip } from '../components/ArtStrip'
import { Loom } from '../components/Loom'
import show from '../generated/showcase.json'

export const prerender = true
export const meta: Meta = { title: { absolute: 'weft: a TypeScript framework for fast web apps' }, description: 'Write components in TSX. weft compiles them to small, direct page updates, with routing, data, a UI kit and errors your coding agent can act on.' }

const components = kit.reduce((n, g) => n + g.items.length, 0)
const SHOWN = ['weft-warp', 'solid-kobalte', 'react-radix', 'react-mui']
const SIZES = SHOWN.map(id => numbers.stacks.find(s => s.id === id)!).map(s => [s.label, s.js] as const)
const FILES = `src/routes/index.tsx          the / page
src/routes/products/[id].tsx  the /products/:id page
src/server/shop.ts            queries and mutations
src/db/schema.ts              your tables`

export default function Home() {
  return (
    <>
      <section data-site="hero">
        <div data-part="poster"></div>
        <Loom />
        <div data-part="say">
          <h1>The TypeScript framework for fast web apps.</h1>
          <p>Write components in TSX, as you would in React. weft compiles them into small, direct page updates, and comes with routing, data, a UI kit and errors your coding agent can act on.</p>
          <div data-part="next">
            <Link data-scope="button" data-size="lg" href="/learn">Get started</Link>
            <Link data-part="quiet" href="/examples">See examples</Link>
          </div>
          <p data-part="install"><code>node packages/create-weft/scripts/local.mjs new my-app</code><span>weft is not on npm yet, so run this from a checkout of the repo.</span></p>
        </div>
      </section>

      <div data-site="story">
        <p data-part="lead">Here is a small shop, built one idea at a time. Each step adds a few lines, marked in the code, and each one is running.</p>

        <section>
          <h2 data-flow="heading">You already know how to write this</h2>
          <p data-part="intro">A weft component is a function that returns TSX. Keep a value in <code>state</code>, show it, change it. There is no new template language to learn.</p>
          <Example id="shop-1" plain><Shop1 /></Example>
        </section>

        <ArtStrip />

        <section>
          <h2 data-flow="heading">Values that keep themselves right</h2>
          <p data-part="intro">Say how a value is worked out, and weft keeps it current. The shop gets a total, and shipping that turns free at $36.</p>
          <Example id="shop-2" plain><Shop2 /></Example>
        </section>

        <section>
          <h2 data-flow="heading">Only what changed gets updated</h2>
          <p data-part="intro">Most frameworks re-run your component and compare the result to find what changed. weft works that out when it compiles, so a change goes straight to the piece of the page it affects. The shop gets more products and a search box: one new value and one line of filtering, and everything that depends on it follows.</p>
          <Example id="shop-4" plain><Shop4 /></Example>
        </section>

        <section>
          <h2 data-flow="heading">A UI kit comes with it</h2>
          <p data-part="intro">The buttons and fields so far are warp, weft's own component library: {components} components, with keyboard support, themes and 651 icons. The shop gets a checkout.</p>
          <Example id="shop-5" plain><Shop5 /></Example>
          <p data-part="more"><Link href="/components">Browse the components</Link></p>
        </section>

        <section>
          <h2 data-flow="heading">One project, front to back</h2>
          <p data-part="intro">A real shop keeps its products in a database. With <code>@weft-js/start</code>, a server query lives beside your components, and each file in <code>src/routes</code> is a page. Database and sign-in are built in, so the whole app is one codebase.</p>
          <div data-part="server" data-scope="codeblock" innerHTML={show.server}></div>
          <pre data-part="files"><code>{FILES}</code></pre>
          <p data-part="more"><Link href="/learn/full-stack">Read about full-stack weft</Link></p>
        </section>

        <Arena />

        <section>
          <h2 data-flow="heading">Pages load fast because there is less to download</h2>
          <p data-part="intro">The same dashboard app, built with a UI kit in each framework. Less JavaScript means pages are ready sooner, most of all on phones and slow connections.</p>
          <ul data-part="sizes">
            {SIZES.map(([name, bytes]) => <li key={name} style={`--share:${bytes / SIZES[SIZES.length - 1]![1]}`}><span>{name}</span><i></i><b>{(bytes / 1024).toFixed(1)} KB</b></li>)}
          </ul>
          <p data-part="note">JavaScript sent to the browser, compressed with brotli, from this repo's <a href="https://github.com/Ravonus/weft/tree/main/evals/compare" rel="external">comparison app</a>.</p>
        </section>

        <Fix />

        <section data-part="end">
          <h2 data-flow="heading">Build something</h2>
          <p data-part="intro">Set up a project in a couple of minutes, then work through the short guides.</p>
          <div data-part="next">
            <Link data-scope="button" data-size="lg" href="/learn">Get started</Link>
            <Link data-part="quiet" href="/reference">Read the reference</Link>
          </div>
        </section>
      </div>
    </>
  )
}
