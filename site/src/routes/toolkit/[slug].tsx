import { notFound, redirect, type LoadArgs, type RouteProps } from '@kerf-js/start'
import { Moved } from '../../components/Moved'
import pages from '../../generated/toolkit.json'

const all = pages as unknown as Record<string, { area: string; slug: string }>
const movedTo = (slug: string) =>
  slug === 'art' ? '/art' : all[slug] ? `/${all[slug].area}/${slug}` : undefined

// Not prerendered, so the server answers each old address with a permanent redirect.
export const load = ({ params }: LoadArgs<'/toolkit/[slug]'>) => {
  const to = movedTo(params.slug)
  return to ? redirect(to, 308) : notFound()
}

export default function Old(props: RouteProps<typeof load, '/toolkit/[slug]'>) {
  return <Moved to={movedTo(props.params.slug) ?? '/components'} />
}
