import { Link, notFound, type LoadArgs, type Meta, type RouteProps } from '@weft/start'
import { Button, Kbd } from '@weft/warp'
import { ExampleFrame, type ShownExample } from '../../components/ExampleFrame'
import { Playground, type ShownPlayground } from '../../components/Playground'
import { Preview } from '../../components/Preview'
import { PropsTable } from '../../components/PropsTable'
import { StageBar } from '../../components/StageBar'
import { Toc } from '../../components/Toc'
import pages from '../../generated/toolkit.json'

type Section = { kind: string; title: string; intro?: string; html?: string; examples?: ShownExample[] }
type Near = { name: string; slug: string }
type Page = {
  name: string; slug: string; group: string; file: string; source: string; sourceFile: string; summary: string; description: string; importLine: string; tile?: string
  use?: { when: string[]; instead?: { name: string; slug: string; why: string }[] }
  playground?: ShownPlayground; sections: Section[]
  keyboard?: [string, string][]; a11yNotes?: string[]
  groups: { title: string; rows: { name: string; type: string; required: boolean; default?: string; doc: string }[] }[]
  parts: string[]; scope?: string; states: string[]
  related: Near[]; toc: { id: string; text: string; depth?: number }[]; prev?: Near; next?: Near
}
const all = pages as unknown as Record<string, Page>
const slugOf = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export const load = ({ params }: LoadArgs<'/toolkit/[slug]'>) => all[params.slug] ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.name, description: data.description })
export const prerender = () => Object.keys(all).map(slug => ({ slug }))

function Example(props: { file: string; example: ShownExample; alone: boolean }) {
  const ex = props.example
  return (
    <section id={ex.id} data-site="ex">
      {!props.alone && <h3>{ex.title}</h3>}
      {ex.note && <p data-part="note" innerHTML={ex.note}></p>}
      <ExampleFrame file={props.file} example={ex} />
    </section>
  )
}

function DocSection(props: { file: string; section: Section }) {
  const s = props.section
  return (
    <section id={slugOf(s.title)} data-site="tk-section">
      <h2>{s.title}</h2>
      {s.html && <div data-scope="prose" innerHTML={s.html}></div>}
      {s.intro && <p data-part="note" innerHTML={s.intro}></p>}
      {s.examples?.map(e => <Example key={e.id} file={props.file} example={e} alone={s.examples!.length === 1} />)}
    </section>
  )
}

export default function ComponentPage(props: RouteProps<typeof load, '/toolkit/[slug]'>) {
  const d = props.data
  return (
    <>
      <article data-site="doc" data-wide="" data-vt="main">
        <header>
          <p data-part="crumb"><Link href="/toolkit">Toolkit</Link><span>/</span><Link href={`/toolkit#${slugOf(d.group)}`}>{d.group}</Link></p>
          <h1>{d.name}</h1>
          <p data-part="lede">{d.summary}</p>
        </header>
        <div data-part="actions">
          <div data-part="import" innerHTML={d.importLine}></div>
          <Link href={d.source} rel="external">Source</Link>
        </div>
        <div data-site="stages">
          <StageBar />
          {d.playground
            ? <section id="playground"><Playground file={d.file} name={d.name} play={d.playground} /></section>
            : null}
          {d.use && (
            <section id="when-to-use" data-site="tk-section">
              <h2>When to use</h2>
              <div data-part="use">
                <div><h3>Use it for</h3><ul>{d.use.when.map(w => <li key={w}>{w}</li>)}</ul></div>
                {d.use.instead?.length ? <div><h3>Reach for something else</h3><ul>{d.use.instead.map(x => <li key={x.name}><Link href={`/toolkit/${x.slug}`}>{x.name}</Link>, when {x.why}</li>)}</ul></div> : null}
              </div>
            </section>
          )}
          {d.sections.map(s => <DocSection key={s.title} file={d.file} section={s} />)}
        </div>
        {(d.keyboard || d.a11yNotes) && (
          <section id="accessibility" data-site="tk-section">
            <h2>Accessibility</h2>
            {d.keyboard && (
              <dl data-part="keys">
                {d.keyboard.map(([keys, does]) => <div key={keys}><dt>{keys.split(' ').map(k => <Kbd key={k}>{k}</Kbd>)}</dt><dd>{does}</dd></div>)}
              </dl>
            )}
            {d.a11yNotes && <ul data-part="notes">{d.a11yNotes.map(n => <li key={n} innerHTML={n}></li>)}</ul>}
          </section>
        )}
        <section id="api" data-site="tk-section">
          <h2>API</h2>
          {d.groups.length ? d.groups.map(g => <PropsTable key={g.title} title={g.title} rows={g.rows} />) : <p data-part="note">Takes no props.</p>}
          {d.parts.length > 0 && (
            <>
              <h3>Parts</h3>
              <p data-part="note">Every element carries a stable name, so you can style it from your own CSS: <code data-scope="code">{`[data-scope="${d.scope ?? d.slug}"] [data-part="${d.parts[0]}"]`}</code></p>
              <p data-part="chips">{d.parts.map(p => <code key={p} data-scope="code">{p}</code>)}</p>
            </>
          )}
        </section>
        {d.related.length > 0 && (
          <section id="related" data-site="tk-section">
            <h2>Related</h2>
            <p data-part="chips">{d.related.map(r => <Link key={r.slug} href={`/toolkit/${r.slug}`} data-scope="button" data-emphasis="outline" data-tone="neutral" data-size="sm">{r.name}</Link>)}</p>
          </section>
        )}
        <footer data-part="pager">
          {d.prev && <Link href={`/toolkit/${d.prev.slug}`} class="prev"><span>Previous</span>{d.prev.name}</Link>}
          {d.next && <Link href={`/toolkit/${d.next.slug}`} class="next"><span>Next</span>{d.next.name}</Link>}
        </footer>
      </article>
      <Toc items={d.toc} />
    </>
  )
}
