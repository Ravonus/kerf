import { Link, notFound, type LoadArgs, type Meta, type RouteProps } from '@weft/start'
import { Preview } from '../../components/Preview'
import { TierPicker } from '../../components/TierPicker'
import pages from '../../generated/toolkit.json'

type Page = { name: string; slug: string; group: string; file: string; lede: string; use: string; props: { name: string; type: string; required: boolean; default?: string; doc: string }[]; cases: { file: string; name: string; label: string; html: string }[] }
const all = pages as unknown as Record<string, Page>

export const load = ({ params }: LoadArgs<'/toolkit/[slug]'>) => all[params.slug] ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.name, description: data.lede.slice(0, 155) || `${data.name}, from warp.` })
export const prerender = () => Object.keys(all).map(slug => ({ slug }))

export default function ComponentPage(props: RouteProps<typeof load, '/toolkit/[slug]'>) {
  return (
    <>
      <article data-site="doc">
        <header>
          <p data-part="crumb">{props.data.group}</p>
          <h1>{props.data.name}</h1>
          {props.data.lede && <p data-part="lede">{props.data.lede}</p>}
        </header>
        <div data-site="stage-bar"><TierPicker /></div>
        <div data-site="stages" data-expression="balanced">
          {props.data.cases.map((c, i) => (
            <section key={c.name} id={i ? c.label.toLowerCase() : 'preview'}>
              {i > 0 && <h2>{c.label}</h2>}
              <Preview file={c.file} name={c.name} />
              <div innerHTML={c.html}></div>
            </section>
          ))}
        </div>
        <h2 id="props">Props</h2>
        {props.data.props.length
          ? <div data-scope="props" tabindex="0" role="region" aria-label="Props">
              <table>
                <thead><tr><th scope="col">Prop</th><th scope="col">Type</th><th scope="col">Default</th><th scope="col">About</th></tr></thead>
                <tbody>
                  {props.data.props.map(p => (
                    <tr key={p.name}>
                      <th scope="row"><code>{p.name}</code>{p.required && <span data-part="req"> required</span>}</th>
                      <td><code>{p.type}</code></td>
                      <td>{p.default ? <code>{p.default}</code> : ''}</td>
                      <td>{p.doc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          : <p>Takes no props.</p>}
        <div innerHTML={props.data.use}></div>
        <p data-part="src"><Link href={`https://github.com/Ravonus/weft/blob/main/${props.data.file}`} rel="external">{props.data.file}</Link></p>
      </article>
    </>
  )
}
