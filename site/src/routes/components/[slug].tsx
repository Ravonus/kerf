import { notFound, type LoadArgs, type Meta, type RouteProps } from '@kerf-js/start'
import { ComponentPage } from '../../components/ComponentPage'
import { pageIn, slugsIn } from '../../lib/pages'
import { DocSkeleton } from '../../components/DocSkeleton'

export const load = ({ params }: LoadArgs<'/components/[slug]'>) =>
  pageIn('components', params.slug) ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.name,
  description: data.description,
})
export const prerender = () => slugsIn('components')

/** Between pages, the doc article's outline, so the page lands where its bars were. */
export const skeleton = DocSkeleton

export default function Page(props: RouteProps<typeof load, '/components/[slug]'>) {
  return <ComponentPage data={props.data} />
}
