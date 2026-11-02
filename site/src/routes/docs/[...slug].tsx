import { Link, notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { Button, Nav } from '@weft-js/warp'
import { PageExample } from '../../components/PageExample'
import pages from '../../generated/docs.json'

const all = pages as unknown as Record<string, { slug: string; title: string; section: string; html: string; description: string; lead?: string; toc: { id: string; text: string }[]; prev?: { slug: string; title: string }; next?: { slug: string; title: string }; parent?: { slug: string; title: string } }>

/** A page's examples: their words and highlighted code, which the page's script then doesn't carry. */
const examples = async (slug: string) => {
  const { demos } = await import('../../demos')
  const ids = Object.keys(demos).filter(id => demos[id]!.page === slug)
  if (!ids.length) return []
  const { default: code } = await import('../../generated/demos.json')
  return ids.map(id => ({ id, look: demos[id]!.look, tryIt: demos[id]!.tryIt, why: demos[id]!.why, code: (code as Record<string, string>)[id]! }))
}

export const load = async ({ params }: LoadArgs<'/docs/[...slug]'>) => {
  const page = all[params.slug] ?? notFound()
  return { ...page, examples: await examples(params.slug) }
}
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.title, description: data.description })
export const prerender = () => Object.keys(all).map(slug => ({ slug }))

/** A folded section opens, and once it has its height the page scrolls to it: until then there's nothing to scroll past. */
const unfold = async (id: string) => {
  const target = document.getElementById(id)
  const fold = target?.closest('details')
  if (!fold || fold.open) return
  fold.open = true
  await Promise.allSettled(fold.getAnimations({ subtree: true }).map(a => a.finished))
  target!.scrollIntoView()
}

/* @weft visible */
function Toc(props: { items: { id: string; text: string }[] }) {
  return <Nav label="On this page" axis="y" spy>{props.items.map(t => <a key={t.id} href={`#${t.id}`} onClick={() => void unfold(t.id)}>{t.text}</a>)}</Nav>
}

export default function DocPage(props: RouteProps<typeof load, '/docs/[...slug]'>) {
  return (
    <>
      <article data-site="doc" data-vt="main">
        <header data-section={props.data.section}>
          <p data-part="crumb">{props.data.parent ? <Link href={`/docs/${props.data.parent.slug}`}>{props.data.parent.title}</Link> : props.data.section}</p>
          <h1>{props.data.title}</h1>
        </header>
        {props.data.lead && <p data-part="lead"
          // oxlint-disable-next-line weft/no-html-sink -- the docs' own Markdown, rendered at build time
          innerHTML={props.data.lead}></p>}
        <PageExample examples={props.data.examples} />
        <div data-scope="prose"
          // oxlint-disable-next-line weft/no-html-sink -- the docs' own Markdown, rendered at build time
          innerHTML={props.data.html}></div>
        <footer data-part="pager">
          {props.data.prev && <Link href={`/docs/${props.data.prev.slug}`} class="prev"><span>Previous</span>{props.data.prev.title}</Link>}
          {props.data.next && <Link href={`/docs/${props.data.next.slug}`} class="next"><span>Next</span>{props.data.next.title}</Link>}
        </footer>
        <p data-part="tools">
          <Button emphasis="ghost" tone="neutral" size="sm" data-act="copy" data-copy-url={`/docs/${props.data.slug}.md`}>Copy as Markdown</Button>
        </p>
      </article>
      <aside data-site="toc"><Toc items={props.data.toc} /></aside>
    </>
  )
}
