import { Link, notFound, redirect, type LoadArgs, type Meta, type RouteProps } from '@kerf-js/start'
import { Button } from '@kerf-js/veneer'
import { LearnDemo } from '../../components/LearnDemo'
import { Toc } from '../../components/Toc'
import moved from '../../generated/learn-moved.json'
import pages from '../../generated/learn.json'
import { DocSkeleton } from '../../components/DocSkeleton'

type Block = { html: string } | { demo: string }
type Page = {
  slug: string
  title: string
  section: string
  box: string
  blocks: Block[]
  toc: { id: string; text: string; depth?: number }[]
  description: string
  prev?: { slug: string; title: string }
  next?: { slug: string; title: string }
}
const all = pages as unknown as Record<string, Page>

/** A page that moved, as its new address: a renamed slug, or its `.md` twin. Not prerendered, so the server answers 308. */
function movedTo(slug: string) {
  const md = slug.endsWith('.md') ? '.md' : ''
  const to = (moved as Record<string, string>)[md ? slug.slice(0, -3) : slug]
  return to && `/learn/${to}${md}`
}

/** The page with each demo's highlighted source and words filled in, so none of that is in the page's script. */
export const load = async ({ params }: LoadArgs<'/learn/[slug]'>) => {
  const page = all[params.slug]
  const to = movedTo(params.slug)
  if (to) return redirect(to, 308)
  if (!page) return notFound()
  const [{ demos }, { tries }, { default: code }] = await Promise.all([
    import('../../demos'),
    import('../../demos/tries'),
    import('../../generated/demos.json'),
  ])
  const blocks = page.blocks.map(
    (b): { html: string } | { demo: string; code: string; tryIt: string } =>
      'demo' in b
        ? {
            demo: b.demo,
            code: (code as Record<string, string>)[b.demo] ?? '',
            tryIt: tries[b.demo] ?? demos[b.demo]?.tryIt ?? '',
          }
        : { html: b.html },
  )
  return { ...page, blocks }
}
export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.title,
  description: data.description,
})
export const prerender = () => Object.keys(all).map((slug) => ({ slug }))

/** Between pages, the doc article's outline, so the page lands where its bars were. */
export const skeleton = DocSkeleton

export default function LearnPage(props: RouteProps<typeof load, '/learn/[slug]'>) {
  return (
    <>
      <article data-site="doc" data-vt="main">
        <header>
          <p data-part="crumb">
            <Link href="/learn">Learn</Link>
            <span aria-hidden="true">/</span>
            {props.data.section}
          </p>
          <h1>{props.data.title}</h1>
        </header>
        <aside data-site="you-will-learn">
          <p data-part="label">You will learn</p>
          <div
            // oxlint-disable-next-line kerf/no-html-sink -- this site's own Markdown, rendered at build time
            innerHTML={props.data.box}
          ></div>
        </aside>
        <p data-part="actions">
          <Button
            emphasis="outline"
            tone="neutral"
            size="sm"
            icon="copy"
            data-act="copy"
            data-copy-url={`/learn/${props.data.slug}.md`}
          >
            Copy as Markdown
          </Button>
        </p>
        {props.data.blocks.map((b, i) =>
          'demo' in b ? (
            <section key={i} data-site="example" data-learn="">
              <div data-part="pair">
                <LearnDemo id={b.demo} />
                <div
                  data-scope="codeblock"
                  // oxlint-disable-next-line kerf/no-html-sink -- highlighted at build time from this repo's demos
                  innerHTML={b.code}
                ></div>
              </div>
              {b.tryIt && (
                <p data-part="try">
                  <strong>Try this:</strong> {b.tryIt}
                </p>
              )}
            </section>
          ) : (
            <div
              key={i}
              data-scope="prose"
              // oxlint-disable-next-line kerf/no-html-sink -- this site's own Markdown, rendered at build time
              innerHTML={b.html}
            ></div>
          ),
        )}
        {pager(() => props.data)}
      </article>
      {props.data.toc.length > 0 && <Toc items={props.data.toc} />}
    </>
  )
}

function pager(data: () => RouteProps<typeof load, '/learn/[slug]'>['data']) {
  return (
    <footer data-part="pager">
      {data().prev ? (
        <Link href={`/learn/${data().prev!.slug}`} class="prev">
          <span>Previous</span>
          {data().prev!.title}
        </Link>
      ) : (
        <Link href="/learn" class="prev">
          <span>Previous</span>Overview
        </Link>
      )}
      {data().next ? (
        <Link href={`/learn/${data().next!.slug}`} class="next">
          <span>Next</span>
          {data().next!.title}
        </Link>
      ) : (
        <Link href="/reference" class="next">
          <span>Next</span>Reference
        </Link>
      )}
    </footer>
  )
}
