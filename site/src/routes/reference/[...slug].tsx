import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { Link } from '@weft-js/start'
import { Button } from '@weft-js/warp'
import { PageExample } from '../../components/PageExample'
import { Toc } from '../../components/Toc'
import pages from '../../generated/reference.json'

const all = pages as unknown as Record<string, { slug: string; title: string; section: string; html: string; description: string; lead?: string; toc: { id: string; text: string }[]; prev?: { slug: string; title: string }; next?: { slug: string; title: string }; parent?: { slug: string; title: string } }>

/** A page's examples: their words and highlighted code, which the page's script then doesn't carry. */
const examples = async (slug: string) => {
  const { demos } = await import('../../demos')
  const ids = Object.keys(demos).filter(id => demos[id]!.page === slug)
  if (!ids.length) return []
  const { default: code } = await import('../../generated/demos.json')
  return ids.map(id => ({ id, look: demos[id]!.look, tryIt: demos[id]!.tryIt, why: demos[id]!.why, code: (code as Record<string, string>)[id]! }))
}

export const load = async ({ params }: LoadArgs<'/reference/[...slug]'>) => {
  const page = all[params.slug] ?? notFound()
  return { ...page, examples: await examples(params.slug) }
}
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: data.description })
export const prerender = () => Object.keys(all).map(slug => ({ slug }))

export default function ReferencePage(props: RouteProps<typeof load, '/reference/[...slug]'>) {
  return (
    <>
      <article data-site="doc" data-vt="main">
        <header data-section={props.data.section}>
          <p data-part="crumb">{props.data.parent ? <Link href={`/reference/${props.data.parent.slug}`}>{props.data.parent.title}</Link> : props.data.section}</p>
          <h1>{props.data.title}</h1>
        </header>
        {props.data.lead && <p data-part="lead" innerHTML={props.data.lead}></p>}
        <p data-part="actions">
          <Button emphasis="outline" tone="neutral" size="sm" icon="copy" data-act="copy" data-copy-url={`/reference/${props.data.slug}.md`}>Copy as Markdown</Button>
        </p>
        <PageExample examples={props.data.examples} />
        <div data-scope="prose"
          // oxlint-disable-next-line weft/no-html-sink -- the docs' own Markdown, rendered at build time
          innerHTML={props.data.html}></div>
        <footer data-part="pager">
          {props.data.prev && <Link href={`/reference/${props.data.prev.slug}`} class="prev"><span>Previous</span>{props.data.prev.title}</Link>}
          {props.data.next && <Link href={`/reference/${props.data.next.slug}`} class="next"><span>Next</span>{props.data.next.title}</Link>}
        </footer>
      </article>
      {/* No headings, no contents column: the grid only makes room for one that's there. */}
      {props.data.toc.length > 0 && <Toc items={props.data.toc} />}
    </>
  )
}
