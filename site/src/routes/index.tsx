import type { Meta } from '@weft/start'
import { Link } from '@weft/start'
import { CodeBlock, Snippet } from '@weft/warp'
import { CounterProof } from '../components/CounterProof'
import { DialProof } from '../components/DialProof'
import { SpotlightHint } from '../components/SpotlightHint'
import numbers from '../generated/numbers.json'

export const meta: Meta = { title: { absolute: 'weft: TSX where a change is one DOM write' } }

const kb = (n: number) => (n / 1024).toFixed(1)
const stack = (id: string) => numbers.stacks.find(s => s.id === id)!
const SAME_CSS = ['weft-plain', 'solid-kobalte', 'react-radix', 'react-zustand']
const KITS = ['weft-warp', 'react-mui']

const COUNTER = `import { state } from 'weft'

export function Counter() {
  const n = state(0)
  return <button onClick={() => n.value++}>{n.value}</button>
}`

const COMPILED = `// What the compiler writes: the body runs once, and the
// one binding that reads count writes one text node.
const el = template('<button> </button>')
el.onclick = () => count.value++
watch(() => text.data = count.value)`

/** One row of a comparison: a bar scaled to the worst stack. Plain HTML, so the proof costs no script. */
function Bar(props: { label: string; value: number; max: number; unit: string; own?: boolean }) {
  return (
    <div data-site="bar-row" data-own={props.own ? '' : undefined}>
      <span>{props.label}</span>
      <i style={`--_w:${(props.value / props.max) * 100}%`}></i>
      <b>{props.value}{props.unit}</b>
    </div>
  )
}

export default function Home() {
  const totals = [...SAME_CSS, ...KITS].map(stack).map(s => ({ ...s, total: Number(kb(s.js + s.css)) }))
  const maxTotal = Math.max(...totals.map(t => t.total))
  const sort = [...SAME_CSS, ...KITS].map(stack).map(s => ({ ...s, n: s.steps.sort }))
  const picker = [...SAME_CSS, ...KITS].map(stack).map(s => ({ ...s, n: s.steps['column picker'] }))
  const maxPicker = Math.max(...picker.map(p => p.n))
  const maxSort = Math.max(...sort.map(p => p.n))
  return (
    <>
      <section data-site="hero">
        <div data-part="copy">
          <p data-part="eyebrow">A compiled TSX framework, and its UI toolkit</p>
          <h1>TSX where a change is one DOM write.</h1>
          <p data-part="lede">
            weft compiles TSX to direct DOM bindings. A component body runs once. A changed value writes only what read it. When
            code goes wrong, the compiler says why with a code an agent can act on.
          </p>
          <div data-part="actions">
            <Snippet code="node packages/create-weft/scripts/local.mjs new my-app" />
            <SpotlightHint />
          </div>
          <p data-part="note">weft isn't on npm yet: that runs from a checkout of the repo.</p>
        </div>
        <CounterProof code={<CodeBlock code={COUNTER} filename="Counter.tsx" />} />
      </section>

      <section data-site="proofs" aria-labelledby="proofs-title">
        <header>
          <h2 id="proofs-title">Measured, with the method beside it</h2>
          <p>
            One dashboard built on each stack: a shell and a 200-row table, the same data, the same nine-step script. Every number
            below is read from <code data-scope="code">evals/compare</code>, run {numbers.at} at commit {numbers.commit}.
          </p>
        </header>
        <div data-site="proof-grid">
          <article>
            <h3>What the page sends</h3>
            <p>JS and CSS, brotli, in KB. The first four share one hand-written stylesheet, so compare frameworks there; warp and MUI each bring a design system.</p>
            {totals.map(t => <Bar key={t.id} label={t.label} value={t.total} max={maxTotal} unit="" own={t.id.startsWith('weft')} />)}
          </article>
          <article>
            <h3>What a sort writes</h3>
            <p>DOM mutations for one column sort on 200 rows, counted by a MutationObserver. weft doesn't win every step: on a live-cell update it ties React at 3.</p>
            {sort.map(t => <Bar key={t.id} label={t.label} value={t.n} max={maxSort} unit="" own={t.id.startsWith('weft')} />)}
          </article>
          <article>
            <h3>What a menu writes</h3>
            <p>DOM mutations for opening the column picker. Kept-mounted menus cost attributes, not nodes.</p>
            {picker.map(t => <Bar key={t.id} label={t.label} value={t.n} max={maxPicker} unit="" own={t.id.startsWith('weft')} />)}
          </article>
        </div>
      </section>

      <section data-site="split" aria-labelledby="compiled-title">
        <div>
          <h2 id="compiled-title">The rule is short</h2>
          <p>State is a box. Anything computed is <code data-scope="code">derived</code>. JSX stays live, and the component body runs once, so there's no dependency array to get wrong and no stale closure to chase.</p>
          <p>When a habit from another framework slips in, the compiler answers with a code and a fix. There are {numbers.codes} of them, one docs page each.</p>
          <p><Link href="/docs">Read the rules</Link></p>
        </div>
        <CodeBlock code={COMPILED} filename="shape of the output" language="ts" />
      </section>

      <section data-site="dial" aria-labelledby="dial-title">
        <header>
          <h2 id="dial-title">One toolkit, one dial</h2>
          <p>warp's components read tokens, so three stops restyle the same markup: type, shape, depth and motion together. This panel changes by one attribute.</p>
        </header>
        <DialProof />
      </section>
    </>
  )
}
