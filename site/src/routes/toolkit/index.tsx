import { Link } from '@weft/start'
import { Badge, Button, Input, Progress, Switch, Tag } from '@weft/warp'
import { DialProof } from '../../components/DialProof'
import nav from '../../generated/toolkit-nav.json'

export const prerender = true
export const meta = { title: 'Toolkit', description: `warp: ${nav.reduce((n, g) => n + g.items.length, 0)} components with live previews, props from their types, and three expression tiers.` }

const total = nav.reduce((n, g) => n + g.items.length, 0)
const TIERS = ['quiet', 'balanced', 'vivid']

export default function Toolkit() {
  return (
    <article data-site="doc">
      <header>
        <h1>warp</h1>
        <p data-part="lede">{total} components for weft. Every preview here runs the code warp's own tests run, and every props table is read from its types.</p>
      </header>
      <section data-site="tiers" aria-label="The three expression tiers">
        {TIERS.map(t => (
          <div key={t} data-expression={t}>
            <h2>{t}</h2>
            <Input label="Workspace" defaultValue="Acme" />
            <Switch defaultChecked>Daily digest</Switch>
            <Progress label="Seats used" value={7} max={10} />
            <p data-part="row"><Badge tone="positive">Live</Badge><Tag>v2</Tag></p>
            <p data-part="row"><Button size="sm">Save</Button><Button size="sm" emphasis="outline" tone="neutral">Cancel</Button></p>
          </div>
        ))}
      </section>
      <h2>The dial</h2>
      <DialProof />
      <div data-part="cards">
        {nav.map(g => (
          <section key={g.group}>
            <h2>{g.group}</h2>
            <ul>{g.items.slice(0, 6).map(i => <li key={i.slug}><Link href={`/toolkit/${i.slug}`}>{i.name}</Link></li>)}{g.items.length > 6 && <li>and {g.items.length - 6} more</li>}</ul>
          </section>
        ))}
      </div>
    </article>
  )
}
