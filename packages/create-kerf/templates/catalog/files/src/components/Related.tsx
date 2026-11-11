import { Grid, Text } from '@kerf-js/veneer'
import { ProductCard } from '#/components/ProductCard'
import { relatedProducts } from '#/server/catalog'

export function Related({ id, categoryId }: { id: number; categoryId: number }) {
  const related = relatedProducts(() => ({ id, categoryId }))
  return (
    <>
      {related.value?.length === 0 && (
        <Text subtle>This is the only piece in its aisle for now.</Text>
      )}
      <Grid min="xs" cols={4} gap="group">
        {related.value?.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </Grid>
    </>
  )
}
