import { Grid, Text } from '@weft-js/warp'
import { ProductCard } from '#/components/ProductCard'
import { featuredProducts } from '#/server/catalog'

export function Featured() {
  const featured = featuredProducts()
  return (
    <>
      {featured.value?.length === 0 && <Text subtle>Nothing's on the front table right now. The aisles above are still open.</Text>}
      <Grid min="xs" cols={4} gap="group">
        {featured.value?.map(product => <ProductCard key={product.slug} product={product} />)}
      </Grid>
    </>
  )
}
