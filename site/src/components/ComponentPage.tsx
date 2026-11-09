import { Link } from '@weft-js/start'
import { Kbd } from '@weft-js/warp'
import { ExampleFrame, type ShownExample } from './ExampleFrame'
import { Install } from './Install'
import { Playground, type ShownPlayground } from './Playground'
import { PropsTable } from './PropsTable'
import { ThemingTable, type ThemingRow } from './ThemingTable'
import { Toc } from './Toc'
import { type Area, FLOW } from '../lib/pages'

/**
 * A keyboard row's keys as caps: "Enter, F2" is two alternatives ("or" between them, the comma never inside a cap),
 * "Shift + arrows" joins with a plain "+", and a lowercase word ("click", "arrows") is a word, not a key. A lone ","
 * ("Enter or ,") is the comma key.
 */
export function chords(keys: string): { kind: 'key' | 'word'; text: string }[][] {
  return keys
    .split(/,\s+/)
    .filter(Boolean)
    .map((alt) =>
      alt
        .split(/\s+/)
        .filter(Boolean)
        .map((t) =>
          t === '+' || /^[a-z]{3,}$/.test(t)
            ? { kind: 'word' as const, text: t }
            : { kind: 'key' as const, text: t },
        ),
    )
}

type Section = {
  kind: string
  title: string
  intro?: string
  html?: string
  examples?: ShownExample[]
}
type Near = { name: string; slug: string; href: string }
export type Page = {
  name: string
  slug: string
  area: string
  usage: string
  group: string
  file: string
  source: string
  sourceFile: string
  summary: string
  description: string
  importLine: string
  tile?: string
  use?: { when: string[]; instead?: { name: string; slug: string; href: string; why: string }[] }
  playground?: ShownPlayground
  hero?: ShownExample
  sections: Section[]
  keyboard?: [string, string][]
  a11yNotes?: string[]
  groups: {
    title: string
    rows: { name: string; type: string; required: boolean; default?: string; doc: string }[]
  }[]
  theming: ThemingRow[]
  parts: string[]
  scope?: string
  states: string[]
  related: Near[]
  toc: { id: string; text: string; depth?: number }[]
  prev?: Near
  next?: Near
}
/** A component's name as words: `OrderConfirmation` reads "Order confirmation". */
const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/ ([A-Z])(?=[a-z])/g, (_, c: string) => ` ${c.toLowerCase()}`)
const slugOf = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function Example(props: { file: string; example: ShownExample; alone: boolean; flow: string }) {
  const ex = props.example
  return (
    <section id={ex.id} data-site="ex">
      {!props.alone && <h3 data-flow="heading">{ex.title}</h3>}
      {ex.note && (
        <p
          data-part="note"
          data-flow="item"
          // oxlint-disable-next-line weft/no-html-sink -- rendered at build time from warp's own docs
          innerHTML={ex.note}
        ></p>
      )}
      <ExampleFrame file={props.file} example={ex} flow={props.flow} />
    </section>
  )
}

function DocSection(props: { file: string; section: Section; flow: string }) {
  const s = props.section
  return (
    <section id={slugOf(s.title)} data-site="tk-section">
      <h2 data-flow="heading">{s.title}</h2>
      {s.html && (
        <div
          data-scope="prose"
          // oxlint-disable-next-line weft/no-html-sink -- rendered at build time from warp's own docs
          innerHTML={s.html}
        ></div>
      )}
      {s.intro && (
        <p
          data-part="note"
          data-flow="item"
          // oxlint-disable-next-line weft/no-html-sink -- rendered at build time from warp's own docs
          innerHTML={s.intro}
        ></p>
      )}
      {s.examples?.map((e) => (
        <Example
          key={e.id}
          file={props.file}
          example={e}
          alone={s.examples!.length === 1}
          flow={props.flow}
        />
      ))}
    </section>
  )
}

/** Every component's page, in one order: preview, install, try it, usage, one heading per real option, then the reference. */
export function ComponentPage(props: { data: Page }) {
  const d = props.data
  return (
    <>
      <article data-site="doc" data-vt="main" data-wide={d.area === 'blocks' ? '' : undefined}>
        <header>
          <h1>{d.name}</h1>
          <p data-part="lede">{d.summary}</p>
          <p data-part="links">
            <Link href={d.source} rel="external">
              Source
            </Link>
            <span>
              Package <code data-scope="code">@weft-js/warp</code>
            </span>
            {d.playground && <a href="#playground">Try it</a>}
          </p>
        </header>
        {d.hero && <HeroContent data={d} />}
        <section id="installation" data-site="tk-section">
          <h2 data-flow="heading">Installation</h2>
          <Install />
        </section>
        {d.playground && <PlaygroundContent data={d} />}
        <section id="usage" data-site="tk-section">
          <h2 data-flow="heading">Usage</h2>
          <div
            // oxlint-disable-next-line weft/no-html-sink -- rendered at build time from warp's own docs
            innerHTML={d.usage}
          ></div>
        </section>
        {d.sections.map((s) => (
          <DocSection key={s.title} file={d.file} section={s} flow={FLOW[d.area as Area]} />
        ))}
        {d.use && <UsageContent data={d} />}
        {(d.keyboard || d.a11yNotes) && <AccessibilityContent data={d} />}
        <section id="api-reference" data-site="tk-section">
          <h2 data-flow="heading">API Reference</h2>
          {d.groups.length ? (
            d.groups.map((g) => <PropsTable key={g.title} title={g.title} rows={g.rows} />)
          ) : (
            <p data-part="note" data-flow="item">
              Takes no props.
            </p>
          )}
          <ThemingTable rows={d.theming} />
          {d.parts.length > 0 && <PartsContent data={d} />}
          {d.related.length > 0 && (
            <p data-part="chips" data-site="related" data-flow="item">
              <span>Related</span>
              {d.related.map((r) => (
                <Link key={r.slug} href={r.href}>
                  {words(r.name)}
                </Link>
              ))}
            </p>
          )}
        </section>
        <footer data-part="pager" data-flow="item">
          {d.prev && (
            <Link href={d.prev.href} class="prev">
              <span>Previous</span>
              {d.prev.name}
            </Link>
          )}
          {d.next && (
            <Link href={d.next.href} class="next">
              <span>Next</span>
              {d.next.name}
            </Link>
          )}
        </footer>
      </article>
      {d.area !== 'blocks' && d.toc.length > 0 && <Toc items={d.toc} />}
    </>
  )
}

function UsageContent(props: { data: Page }) {
  const d = props.data
  return (
    <section id="when-to-use" data-site="tk-section">
      <h2 data-flow="heading">When to use</h2>
      <div data-part="use" data-flow="item">
        <div>
          <h3 data-flow="heading">Use it for</h3>
          <ul>
            {d.use!.when.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
        {d.use!.instead?.length ? (
          <div>
            <h3 data-flow="heading">Reach for something else</h3>
            <ul>
              {d.use!.instead.map((x) => (
                <li key={x.name}>
                  <Link href={x.href}>{x.name}</Link>, when {x.why}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function AccessibilityContent(props: { data: Page }) {
  const d = props.data
  return (
    <section id="accessibility" data-site="tk-section">
      <h2 data-flow="heading">Accessibility</h2>
      {d.keyboard && (
        <dl data-part="keys" data-flow="item">
          {d.keyboard.map(([keys, does]) => (
            <div key={keys}>
              <dt>
                {chords(keys).map((alt, i) => (
                  <span key={i} data-part="chord">
                    {i > 0 && <span data-part="key-word">or</span>}
                    {alt.map((t, j) =>
                      t.kind === 'key' ? (
                        <Kbd key={j}>{t.text}</Kbd>
                      ) : (
                        <span key={j} data-part="key-word">
                          {t.text}
                        </span>
                      ),
                    )}
                  </span>
                ))}
              </dt>
              <dd>{does}</dd>
            </div>
          ))}
        </dl>
      )}
      {d.a11yNotes && (
        <ul data-part="notes" data-flow="item">
          {d.a11yNotes.map((n) => (
            <li
              key={n}
              // oxlint-disable-next-line weft/no-html-sink -- rendered at build time from warp's own docs
              innerHTML={n}
            ></li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PartsContent(props: { data: Page }) {
  const d = props.data
  return (
    <>
      <h3 data-flow="heading">Parts</h3>
      <p data-part="note" data-flow="item">
        Every element carries a stable name, so you can style it from your own CSS:{' '}
        <code data-scope="code">{`[data-scope="${d.scope ?? d.slug}"] [data-part="${d.parts[0]}"]`}</code>
      </p>
      <p data-part="chips" data-flow="item">
        {d.parts.map((p) => (
          <code key={p} data-scope="code">
            {p}
          </code>
        ))}
      </p>
    </>
  )
}

function HeroContent(props: { data: Page }) {
  const d = props.data
  return (
    <section id="preview" data-site="tk-default" aria-labelledby="preview-t">
      <h2 id="preview-t" data-part="sr-only">
        Preview
      </h2>
      <ExampleFrame file={d.file} example={d.hero!} hero flow={FLOW[d.area as Area]} />
    </section>
  )
}

function PlaygroundContent(props: { data: Page }) {
  const d = props.data
  return (
    <section id="playground" data-site="tk-section" data-try="">
      <h2 data-flow="heading">Try it</h2>
      <p data-part="note" data-flow="item">
        Change the controls: the preview and its code update together. The address keeps what you
        set, so you can link to it.
      </p>
      <Playground file={d.file} name={d.name} play={d.playground!} flow={FLOW[d.area as Area]} />
    </section>
  )
}
