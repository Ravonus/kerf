import { Link, type Meta } from '@weft/start'
import { Preview } from '../../components/Preview'
import { StageBar } from '../../components/StageBar'
import { ToolkitFilter } from '../../components/ToolkitFilter'
import index from '../../generated/toolkit-index.json'

type Tile = { name: string; slug: string; summary: string; id?: string }
type Group = { title: string; id: string; file: string; intro: string; pack?: boolean; tiles: Tile[] }
const groups = (index.groups as Group[]).filter(g => g.tiles.length)
const PACK = 4
const chips = groups.map(g => ({ id: g.id, title: g.title, count: g.tiles.length }))

export const prerender = true
export const meta: Meta = { title: 'Toolkit', description: `warp is weft's UI kit: ${index.total} components with keyboard support, three looks and live examples.` }

function Card(props: { file: string; tile: Tile; hidden?: boolean }) {
  return (
    <Link href={`/toolkit/${props.tile.slug}`} data-site="tile" data-name={props.tile.name.toLowerCase()} data-rest={props.hidden ? '' : undefined}>
      <div data-part="stage">{props.tile.id && <Preview file={props.file} id={props.tile.id} tile />}</div>
      <div data-part="words"><strong>{props.tile.name}</strong><span>{props.tile.summary}</span></div>
    </Link>
  )
}

function Group(props: { group: Group }) {
  const g = props.group
  return (
    <section id={g.id} data-tk="group" data-title={g.title}>
      <header>
        <h2>{g.title}</h2>
        <p>{g.intro}</p>
      </header>
      <div data-tk="tiles">{g.tiles.map((t, i) => <Card key={t.slug} file={g.file} tile={t} hidden={g.pack && i >= PACK} />)}</div>
      {g.pack && g.tiles.length > PACK && <p data-tk="all"><Link href={`/toolkit/${g.tiles[PACK].slug}`}>All {g.tiles.length} in {g.title}</Link></p>}
    </section>
  )
}

export default function Toolkit() {
  return (
    <article data-site="doc" data-toolkit="">
      <div data-part="band"></div>
      <header>
        <h1>The toolkit</h1>
        <p data-part="lede">warp is weft's UI kit. {index.total} components that work with a keyboard, follow your theme, and cost nothing until you use them.</p>
      </header>
      <div data-site="stages">
        <StageBar />
        <ToolkitFilter groups={chips} />
        {groups.map(g => <Group key={g.id} group={g} />)}
      </div>
    </article>
  )
}
