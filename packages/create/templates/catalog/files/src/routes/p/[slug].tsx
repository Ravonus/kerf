import { Link, notFound, type LoadArgs, type Meta, type RouteProps } from '@weft-js/start'
import { Badge, Center, Heading, Row, Stack, Text } from '@weft-js/warp'
import { Boundary } from '@weft-js/core'
import { AddToCart } from '#/components/AddToCart'
import { Failed } from '#/components/Failed'
import { ProductArt } from '#/components/ProductArt'
import { ProductGridLoading } from '#/components/ProductCard'
import { Related } from '#/components/Related'
import { money } from '#/lib/catalog'
import { getProduct } from '#/server/catalog'

export const load = async ({ params }: LoadArgs<'/p/[slug]'>) => {
  const product = await getProduct.fetch({ slug: params.slug })
  return product ? { product } : notFound()
}

export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.product.name,
  description: data.product.description,
})

const stockLine = (stock: number) =>
  stock === 0
    ? 'Back when the workshop catches up.'
    : stock < 5
      ? `Only ${stock} left.`
      : 'In stock, ships in two days.'

export default function Product(props: RouteProps<typeof load, '/p/[slug]'>) {
  return (
    <Center max="wide" gutter>
      <Stack gap="page" class="page">
        <article class="detail">
          <ProductArt name={props.data.product.name} />
          <Stack gap="related">
            <Link href={`/c/${props.data.product.categorySlug}`} class="crumb">
              {props.data.product.categoryName}
            </Link>
            <Heading level={1} role="title">
              {props.data.product.name}
            </Heading>
            <Row gap="related">
              <span class="price price-lg">{money(props.data.product.priceCents)}</span>
              {props.data.product.stock === 0 && <Badge tone="neutral">Sold out</Badge>}
            </Row>
            <Text>{props.data.product.description}</Text>
            <Text subtle>{stockLine(props.data.product.stock)}</Text>
            <AddToCart slug={props.data.product.slug} soldOut={props.data.product.stock === 0} />
          </Stack>
        </article>
        <section aria-labelledby="related-title">
          <Stack gap="related">
            <Heading level={2} id="related-title">
              From the same aisle
            </Heading>
            <Boundary
              pending={<ProductGridLoading count={4} cols={4} label="Loading related goods" />}
              error={(_, retry) => <Failed what="Related goods" retry={retry} />}
            >
              <Related id={props.data.product.id} categoryId={props.data.product.categoryId} />
            </Boundary>
          </Stack>
        </section>
      </Stack>
    </Center>
  )
}
