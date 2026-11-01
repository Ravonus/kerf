import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft/start'
import { Link } from '@weft/start'
import { Button } from '@weft/warp'
import pages from '../../generated/docs.json'

const all = pages as unknown as Record<string, { slug: string; title: string; section: string; html: string; description: string; toc: { id: string; text: string }[]; prev?: { slug: string; title: string }; next?: { slug: string; title: string }; parent?: { slug: string; title: string } }>

export const load = ({ params }: LoadArgs<'/docs/[...slug]'>) => all[params.slug] ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: data.description })
export const prerender = () => Object.keys(all).map(slug => ({ slug }))

export default function DocPage(props: RouteProps<typeof load, '/docs/[...slug]'>) {
  return (
    <>
      <article data-site="doc">
        <header>
          <p data-part="crumb">{props.data.parent ? <Link href={`/docs/${props.data.parent.slug}`}>{props.data.parent.title}</Link> : props.data.section}</p>
          <h1>{props.data.title}</h1>
          <div data-part="tools">
            <Button emphasis="ghost" tone="neutral" size="sm" data-act="copy" data-copy-url={`/docs/${props.data.slug}.md`}>Copy as Markdown</Button>
            <a data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" href={`/docs/${props.data.slug}.md`} rel="external">View .md</a>
          </div>
        </header>
        <div data-scope="prose" innerHTML={props.data.html}></div>
        <footer data-part="pager">
          {props.data.prev && <Link href={`/docs/${props.data.prev.slug}`} class="prev">{props.data.prev.title}</Link>}
          {props.data.next && <Link href={`/docs/${props.data.next.slug}`} class="next">{props.data.next.title}</Link>}
        </footer>
      </article>
      <nav data-site="toc" aria-label="On this page">
        {props.data.toc.length > 1 && <h2>On this page</h2>}
        {props.data.toc.length > 1 && <ul>{props.data.toc.map(t => <li key={t.id}><Link href={`#${t.id}`}>{t.text}</Link></li>)}</ul>}
      </nav>
    </>
  )
}
