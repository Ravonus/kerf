import { notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { ComponentPage } from '../../components/ComponentPage'
import { pageIn, slugsIn } from '../../lib/pages'
import { DocSkeleton } from '../../components/DocSkeleton'

export const load = ({ params }: LoadArgs<'/blocks/[slug]'>) =>
  pageIn('blocks', params.slug) ?? notFound()
export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.name,
  description: data.description,
})
export const prerender = () => slugsIn('blocks')

/** Between pages, the doc article's outline, so the page lands where its bars were. */
export const skeleton = DocSkeleton

export default function Page(props: RouteProps<typeof load, '/blocks/[slug]'>) {
  return <ComponentPage data={props.data} />
}
