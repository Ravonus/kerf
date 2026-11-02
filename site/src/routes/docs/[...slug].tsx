import { redirect, type LoadArgs, type RouteProps } from '@weft-js/start'
import { Moved } from '../../components/Moved'

/** Where an old /docs page lives now. Getting started is Learn's first page; every other page, codes included, is Reference. */
function movedTo(slug: string) {
  const md = slug.endsWith('.md') ? '.md' : ''
  const page = md ? slug.slice(0, -3) : slug
  if (!page) return '/learn' // /docs itself, which the rest-route matches as well as index.tsx
  return page === 'getting-started' ? `/learn/installation${md}` : `/reference/${page}${md}`
}

// Not prerendered, so the server answers each old address with a permanent redirect, `.md` twins included.
export const load = ({ params }: LoadArgs<'/docs/[...slug]'>) => redirect(movedTo(params.slug), 308)

export default function Old(props: RouteProps<typeof load, '/docs/[...slug]'>) {
  return <Moved to={movedTo(props.params.slug)} />
}
