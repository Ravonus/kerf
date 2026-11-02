import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { ComponentPage } from '../../components/ComponentPage'
import { pageIn, slugsIn } from '../../lib/pages'

export const load = ({ params }: LoadArgs<'/charts/[slug]'>) => pageIn('charts', params.slug) ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.name, description: data.description })
export const prerender = () => slugsIn('charts')

export default function Page(props: RouteProps<typeof load, '/charts/[slug]'>) {
  return <ComponentPage data={props.data} />
}
