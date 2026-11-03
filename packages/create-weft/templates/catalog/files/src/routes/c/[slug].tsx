import { Link, notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { Center, Heading, Split, Stack } from '@weft-js/warp'
import { Boundary } from '@weft-js/core'
import { Aisles, AislesLoading } from '#/components/Aisles'
import { Failed } from '#/components/Failed'
import { Filters } from '#/components/Filters'
import { ProductGridLoading } from '#/components/ProductCard'
import { ProductList } from '#/components/ProductList'
import { viewOf } from '#/lib/catalog'
import { getCategory } from '#/server/catalog'

export const load = async ({ params, request }: LoadArgs<'/c/[slug]'>) => {
  const category = await getCategory.fetch({ slug: params.slug })
  return category ? { category, view: viewOf(request.url) } : notFound()
}

export const meta: Meta<typeof load> = ({ data }) => ({ title: data.category.name })

export default function Category(props: RouteProps<typeof load, '/c/[slug]'>) {
  return (
    <Center max="wide" gutter>
      <Stack gap="group" class="page">
        <Stack gap="tight">
          <Link href="/" class="crumb">All aisles</Link>
          <Heading level={1} role="title">{props.data.category.name}</Heading>
        </Stack>
        <Boundary pending={<AislesLoading />} error={(_, retry) => <Failed what="The aisles" retry={retry} />}>
          <Aisles current={props.data.category.slug} />
        </Boundary>
        <Split side="start" width="nav" gap="section">
          <Filters slug={props.data.category.slug} view={props.data.view} />
          <Boundary pending={<ProductGridLoading count={24} cols={3} label="Loading goods" />} error={(_, retry) => <Failed what="This aisle" retry={retry} />}>
            <ProductList categoryId={props.data.category.id} slug={props.data.category.slug} view={props.data.view} />
          </Boundary>
        </Split>
      </Stack>
    </Center>
  )
}
