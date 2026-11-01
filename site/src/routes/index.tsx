import { Link, type Meta } from '@weft/start'
import { Arena } from '../components/Arena'
import { Example } from '../components/Example'
import { Fix } from '../components/Fix'
import { Loom } from '../components/Loom'

export const prerender = true
export const meta: Meta = { title: { absolute: 'weft: a TypeScript framework for fast web apps' }, description: 'Write components in TSX. weft compiles them to small, direct page updates, with routing, data, a UI kit and errors your coding agent can act on.' }

const SIZES = [['weft + warp', 22949], ['Solid + Kobalte', 48502], ['React + Radix', 100669], ['React + MUI', 245376]] as const
const FILES = `src/routes/index.tsx       the / page
src/routes/todos/[id].tsx  the /todos/:id page
src/server/todos.ts        queries and mutations
src/db/schema.ts           your tables`

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
            <Link data-scope="button" data-size="lg" href="/docs/getting-started">Get started</Link>
            <Link data-part="quiet" href="/examples">See examples</Link>
          </div>
          <p data-part="install"><code>node packages/create-weft/scripts/local.mjs new my-app</code><span>weft is not on npm yet, so run this from a checkout of the repo.</span></p>
        </div>
      </section>

      <div data-site="story">
        <section>
          <h2>You already know how to write this</h2>
          <p data-part="intro">A weft component is a function that returns TSX. Keep a value in <code>state</code>, show it, change it. There is no new template language, and your component function runs only once, so there are no dependency arrays to get right.</p>
          <Example id="getting-started" plain />
        </section>

        <section>
          <h2>Only what changed gets updated</h2>
          <p data-part="intro">Most frameworks re-run your component and compare the result to find what changed. weft works that out at compile time, so a change goes straight to the piece of the page it affects. Your app stays quick as it grows, without tuning.</p>
          <Example id="prices" plain />
        </section>

        <Arena />

        <section>
          <h2>Pages load fast because there is less to download</h2>
          <p data-part="intro">The same dashboard app, built with a UI kit in each framework. Less JavaScript means pages are ready sooner, most of all on phones and slow connections.</p>
          <ul data-part="sizes">
            {SIZES.map(([name, bytes]) => <li key={name} style={`--share:${bytes / SIZES[3][1]}`}><span>{name}</span><i></i><b>{(bytes / 1024).toFixed(1)} KB</b></li>)}
          </ul>
          <p data-part="note">JavaScript sent to the browser, compressed with brotli, from this repo's <a href="https://github.com/Ravonus/weft/tree/main/evals/compare" rel="external">comparison app</a>.</p>
        </section>

        <section>
          <h2>A UI kit comes with it</h2>
          <p data-part="intro">warp is weft's own component library: 227 components, with keyboard support, themes and 651 icons. You can build a real screen on day one instead of picking and wiring up a library.</p>
          <Example id="ui-kit" plain />
          <p data-part="more"><Link href="/toolkit">Browse the toolkit</Link></p>
        </section>

        <section>
          <h2>One project, front to back</h2>
          <p data-part="intro">With <code>@weft/start</code>, each file in <code>src/routes</code> is a page, and functions in <code>src/server</code> run on the server and can be called from your components. Database and sign-in are built in too, so a whole app lives in one codebase.</p>
          <pre data-part="files"><code>{FILES}</code></pre>
          <p data-part="more"><Link href="/docs/start">Read about full-stack weft</Link></p>
        </section>

        <Fix />

        <section data-part="end">
          <h2>Build something</h2>
          <p data-part="intro">Set up a project in a couple of minutes, then work through the short guides.</p>
          <div data-part="next">
            <Link data-scope="button" data-size="lg" href="/docs/getting-started">Get started</Link>
            <Link data-part="quiet" href="/docs">Read the docs</Link>
          </div>
        </section>
      </div>
    </>
  )
}
