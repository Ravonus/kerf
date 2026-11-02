import { Link } from '@weft/start'
import { Kbd } from '@weft/warp'
import { ExampleFrame, type ShownExample } from './ExampleFrame'
import { Install } from './Install'
import { Playground, type ShownPlayground } from './Playground'
import { PropsTable } from './PropsTable'
import { Toc } from './Toc'

/**
 * A keyboard row's keys as caps: "Enter, F2" is two alternatives ("or" between them, the comma never inside a cap),
 * "Shift + arrows" joins with a plain "+", and a lowercase word ("click", "arrows") is a word, not a key. A lone ","
 * ("Enter or ,") is the comma key.
 */
export function chords(keys: string): { kind: 'key' | 'word'; text: string }[][] {
  return keys.split(/,\s+/).filter(Boolean).map(alt => alt.split(/\s+/).filter(Boolean).map(t => (t === '+' || /^[a-z]{3,}$/.test(t) ? { kind: 'word' as const, text: t } : { kind: 'key' as const, text: t })))
}

type Section = { kind: string; title: string; intro?: string; html?: string; examples?: ShownExample[] }
type Near = { name: string; slug: string; href: string }
export type Page = {
  name: string; slug: string; area: string; usage: string; group: string; file: string; source: string; sourceFile: string; summary: string; description: string; importLine: string; tile?: string
  use?: { when: string[]; instead?: { name: string; slug: string; href: string; why: string }[] }
  playground?: ShownPlayground; hero?: ShownExample; sections: Section[]
  keyboard?: [string, string][]; a11yNotes?: string[]
  groups: { title: string; rows: { name: string; type: string; required: boolean; default?: string; doc: string }[] }[]
  parts: string[]; scope?: string; states: string[]
  related: Near[]; toc: { id: string; text: string; depth?: number }[]; prev?: Near; next?: Near
}
/** A component's name as words: `OrderConfirmation` reads "Order confirmation". */
const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => ` ${c.toLowerCase()}`)
const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function Example(props: { file: string; example: ShownExample; alone: boolean }) {
  const ex = props.example
  return (
    <section id={ex.id} data-site="ex">
      {!props.alone && <h3 data-flow="heading">{ex.title}</h3>}
      {ex.note && <p data-part="note" data-flow="item" innerHTML={ex.note}></p>}
      <ExampleFrame file={props.file} example={ex} />
    </section>
  )
}

function DocSection(props: { file: string; section: Section }) {
  const s = props.section
  return (
    <section id={slugOf(s.title)} data-site="tk-section">
      <h2 data-flow="heading">{s.title}</h2>
      {s.html && <div data-scope="prose" innerHTML={s.html}></div>}
      {s.intro && <p data-part="note" data-flow="item" innerHTML={s.intro}></p>}
      {s.examples?.map(e => <Example key={e.id} file={props.file} example={e} alone={s.examples!.length === 1} />)}
    </section>
  )
}

/** Every component's page, in one order: preview, install, usage, one heading per real option, then the reference. */
export function ComponentPage(props: { data: Page }) {
  const d = props.data
  return (
    <>
      <article data-site="doc" data-vt="main" data-wide={d.area === 'blocks' ? '' : undefined}>
        <header>
          <h1>{d.name}</h1>
          <p data-part="lede">{d.summary}</p>
          <p data-part="links"><Link href={d.source} rel="external">Source</Link><span>Package <code data-scope="code">@weft/warp</code></span>{d.playground && <a href="#playground">Playground</a>}</p>
        </header>
        {d.hero && <section id="preview" data-site="tk-default"><ExampleFrame file={d.file} example={d.hero} hero /></section>}
        <section id="installation" data-site="tk-section"><h2 data-flow="heading">Installation</h2><Install /></section>
        <section id="usage" data-site="tk-section"><h2 data-flow="heading">Usage</h2><div innerHTML={d.usage}></div></section>
        {d.sections.map(s => <DocSection key={s.title} file={d.file} section={s} />)}
        {d.use && (
          <section id="when-to-use" data-site="tk-section">
            <h2 data-flow="heading">When to use</h2>
            <div data-part="use">
              <div><h3 data-flow="heading">Use it for</h3><ul>{d.use.when.map(w => <li key={w}>{w}</li>)}</ul></div>
              {d.use.instead?.length ? <div><h3 data-flow="heading">Reach for something else</h3><ul>{d.use.instead.map(x => <li key={x.name}><Link href={x.href}>{x.name}</Link>, when {x.why}</li>)}</ul></div> : null}
            </div>
          </section>
        )}
        {d.playground && <section id="playground" data-site="tk-section"><h2 data-flow="heading">Playground</h2><Playground file={d.file} name={d.name} play={d.playground} /></section>}
        {(d.keyboard || d.a11yNotes) && (
          <section id="accessibility" data-site="tk-section">
            <h2 data-flow="heading">Accessibility</h2>
            {d.keyboard && (
              <dl data-part="keys">
                {d.keyboard.map(([keys, does]) => <div key={keys}><dt>{chords(keys).map((alt, i) => <span key={i} data-part="chord">{i > 0 && <span data-part="key-word">or</span>}{alt.map((t, j) => (t.kind === 'key' ? <Kbd key={j}>{t.text}</Kbd> : <span key={j} data-part="key-word">{t.text}</span>))}</span>)}</dt><dd>{does}</dd></div>)}
              </dl>
            )}
            {d.a11yNotes && <ul data-part="notes">{d.a11yNotes.map(n => <li key={n} innerHTML={n}></li>)}</ul>}
          </section>
        )}
        <section id="api-reference" data-site="tk-section">
          <h2 data-flow="heading">API Reference</h2>
          {d.groups.length ? d.groups.map(g => <PropsTable key={g.title} title={g.title} rows={g.rows} />) : <p data-part="note" data-flow="item">Takes no props.</p>}
          {d.parts.length > 0 && (
            <>
              <h3 data-flow="heading">Parts</h3>
              <p data-part="note" data-flow="item">Every element carries a stable name, so you can style it from your own CSS: <code data-scope="code">{`[data-scope="${d.scope ?? d.slug}"] [data-part="${d.parts[0]}"]`}</code></p>
              <p data-part="chips">{d.parts.map(p => <code key={p} data-scope="code">{p}</code>)}</p>
            </>
          )}
          {d.related.length > 0 && <p data-part="chips" data-site="related"><span>Related</span>{d.related.map(r => <Link key={r.slug} href={r.href}>{words(r.name)}</Link>)}</p>}
        </section>
        <footer data-part="pager">
          {d.prev && <Link href={d.prev.href} class="prev"><span>Previous</span>{d.prev.name}</Link>}
          {d.next && <Link href={d.next.href} class="next"><span>Next</span>{d.next.name}</Link>}
        </footer>
      </article>
      {d.area !== 'blocks' && d.toc.length > 0 && <Toc items={d.toc} />}
    </>
  )
}
