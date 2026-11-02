import { notFound, type LoadArgs, type RouteProps } from '@weft-js/start'
import { Moved } from '../../components/Moved'
import pages from '../../generated/toolkit.json'

const all = pages as unknown as Record<string, { area: string; slug: string }>
export const load = ({ params }: LoadArgs<'/toolkit/[slug]'>) => (params.slug === 'art' ? { to: '/art' } : all[params.slug] ? { to: `/${all[params.slug].area}/${params.slug}` } : notFound())
export const prerender = () => [{ slug: 'art' }, ...Object.keys(all).map(slug => ({ slug }))]

export default function Old(props: RouteProps<typeof load, '/toolkit/[slug]'>) {
  return <Moved to={props.data.to} />
}
