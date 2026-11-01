import { Link, type Meta } from '@weft/start'
import { CodeBlock } from '@weft/warp'
import { TierPicker } from '../../components/TierPicker'
import { ToolkitDemo } from '../../components/ToolkitDemo'
import nav from '../../generated/toolkit-nav.json'
import { CANVAS, PACKS, SECTIONS, type Entry, type Section } from '../../toolkit/entries'
import source from '../../toolkit/cases.tsx?raw'

const total = nav.reduce((n, g) => n + g.items.length, 0)

export const prerender = true
export const meta: Meta = { title: 'Toolkit', description: `warp is weft's UI kit: ${total} components with keyboard support, three looks and live demos.` }

/** The text between `// #id` and the next marker: the demo's real source. */
const code = (id: string) => (source.split(`// #${id}\n`)[1] ?? '').split(/\n\/\/ #/)[0].trim()

function Item({ entry }: { entry: Entry }) {
  return (
    <section id={entry.id} data-tk="item" data-wide={entry.wide ? '' : undefined}>
      <h3><Link href={`/toolkit/${entry.slug}`}>{entry.name}</Link></h3>
      <p>{entry.for}</p>
      <ToolkitDemo name={entry.demo} />
      <details><summary>Code</summary><CodeBlock code={code(entry.id)} /></details>
    </section>
  )
}

function Group({ section }: { section: Section }) {
  return (
    <section id={section.id} data-tk="group">
      <h2>{section.title}</h2>
      <p data-tk="intro">{section.intro}</p>
      <div data-tk="items">{section.entries.map(e => <Item key={e.id} entry={e} />)}</div>
    </section>
  )
}

export default function Toolkit() {
  const groups = [...SECTIONS, CANVAS]
  return (
    <article data-site="doc" data-toolkit="">
      <header>
        <h1>The toolkit</h1>
        <p data-part="lede">warp is weft's UI kit. {total} components that work with a keyboard, follow your theme, and cost nothing until you use them. Everything below is running, so try it.</p>
      </header>
      <nav aria-label="On this page" data-tk="jump">{groups.map(g => <Link key={g.id} href={`#${g.id}`}>{g.title}</Link>)}</nav>
      <div data-site="stage-bar"><span>warp has three looks. Try them:</span><TierPicker /></div>
      <div data-site="stages" data-expression="balanced">
        {groups.map(g => <Group key={g.id} section={g} />)}
      </div>
      <section data-tk="group" id="more">
        <h2>And the rest</h2>
        <p data-tk="intro">Bigger pieces for specific kinds of app. Each one has its own page, with a live demo and its code.</p>
        <dl data-tk="packs">
          {PACKS.map(([name, text]) => {
            const items = nav.find(g => g.group === name)?.items ?? []
            return (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{text}</dd>
                <dd data-tk="links">{items.map(i => <Link key={i.slug} href={`/toolkit/${i.slug}`}>{i.name}</Link>)}</dd>
              </div>
            )
          })}
        </dl>
      </section>
    </article>
  )
}
