import { Link } from '@weft/start'
import index from '../generated/toolkit-index.json'
import { type Area, FLOW } from '../lib/pages'
import { DialSwitch } from './DialSwitch'
import { Preview } from './Preview'
import { ToolkitFilter } from './ToolkitFilter'

type Tile = { name: string; slug: string; href: string; summary: string; id?: string; stage?: string; fit?: string; width?: number }
type Group = { title: string; area: string; id: string; file: string; intro: string; tiles: Tile[] }

const NOUN: Record<Area, string> = { components: 'component', blocks: 'block', charts: 'chart' }

function Card(props: { file: string; tile: Tile; flow: string }) {
  const t = props.tile
  return (
    <Link href={t.href} data-site="tile" data-flow={props.flow} data-name={t.name.toLowerCase()}>
      <div data-part="stage" data-flow="off">{t.id && <Preview file={props.file} id={t.id} stage={t.stage} fit={t.fit} width={t.width} tile />}</div>
      <div data-part="words"><strong>{t.name}</strong><span>{t.summary}</span></div>
    </Link>
  )
}

/** An area's index: named cards with a small preview, under plain group headings. */
export function WarpIndex(props: { area: Area; title: string; lede: string }) {
  const groups = (index.groups as Group[]).filter(g => g.tiles.length && g.area === props.area)
  return (
    <article data-site="doc" data-home="" data-area={props.area}>
      <header>
        <h1>{props.title}</h1>
        <p data-part="lede" innerHTML={props.lede}></p>
      </header>
      <div data-site="tk-bar"><ToolkitFilter noun={NOUN[props.area]} /><DialSwitch /></div>
      {groups.map(g => (
        <section key={g.id} id={g.id} data-tk="group" data-title={g.title}>
          <h2 data-flow="heading">{g.title}</h2>
          <div data-tk="tiles">{g.tiles.map(t => <Card key={t.slug} file={g.file} tile={t} flow={FLOW[props.area]} />)}</div>
        </section>
      ))}
    </article>
  )
}
