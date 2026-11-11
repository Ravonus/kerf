import { Link } from '@kerf/start'
import { Badge, Grid, Skeleton } from '@kerf/veneer'
import { ProductArt } from '#/components/ProductArt'
import { money } from '#/lib/catalog'
import type { ProductCardRow } from '#/server/catalog'

export function ProductCard({ product }: { product: ProductCardRow }) {
  return (
    <Link href={`/p/${product.slug}`} class="product">
      <ProductArt name={product.name} />
      <span class="product-name">{product.name}</span>
      <span class="product-foot">
        <span class="price">{money(product.priceCents)}</span>
        {product.stock === 0 && <Badge tone="neutral">Sold out</Badge>}
      </span>
    </Link>
  )
}

export function ProductGridLoading({
  count,
  cols,
  label,
}: {
  count: number
  cols: 3 | 4
  label: string
}) {
  return (
    <div role="status" aria-label={label}>
      <Grid min="xs" cols={cols} gap="group">
        {Array.from({ length: count }, () => (
          <div class="product">
            <Skeleton shape="block" height="auto" width="100%" />
            <Skeleton />
            <Skeleton width="30%" />
          </div>
        ))}
      </Grid>
    </div>
  )
}
