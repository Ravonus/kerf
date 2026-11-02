import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft/start'
import { ComponentPage } from '../../components/ComponentPage'
import { pageIn, slugsIn } from '../../lib/pages'

export const load = ({ params }: LoadArgs<'/components/[slug]'>) => pageIn('components', params.slug) ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.name, description: data.description })
export const prerender = () => slugsIn('components')

export default function Page(props: RouteProps<typeof load, '/components/[slug]'>) {
  return <ComponentPage data={props.data} />
}
