import { Grid, Heading, Link, Stack, Text } from '@kerf-js/veneer'
import { derived } from '@kerf-js/core'
import { ProductCard } from '#/components/ProductCard'
import { PAGE_SIZE, viewHref, type View } from '#/lib/catalog'
import { listProducts } from '#/server/catalog'

export function ProductList({
  categoryId,
  slug,
  view,
}: {
  categoryId: number
  slug: string
  view: View
}) {
  const products = listProducts(() => ({ categoryId, ...view }))
  const rows = derived(() => products.value?.rows ?? [])
  const total = derived(() => products.value?.total ?? 0)
  const pages = derived(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
  const filtered = () => view.min !== null || view.max !== null || view.stock
  return (
    <Stack gap="group">
      <Text subtle aria-live="polite">
        {total.value.toLocaleString('en-US')} {total.value === 1 ? 'piece' : 'pieces'}, lowest price
        first
      </Text>
      {rows.value.length === 0 ? (
        <Stack gap="tight" class="blank">
          <Heading level={2}>
            {filtered() ? 'Nothing fits those filters' : 'This aisle is empty for now'}
          </Heading>
          <Text subtle>
            {filtered()
              ? "Widen the price range, or include what's sold out."
              : "New pieces land here as soon as they're made."}
          </Text>
          {filtered() && <Link href={`/c/${slug}`}>Clear the filters</Link>}
        </Stack>
      ) : (
        <Grid min="xs" cols={3} gap="group">
          {rows.value.map((product) => (
            <ProductCard key={product.slug} product={product} />
          ))}
        </Grid>
      )}
      {pages.value > 1 && (
        <nav class="pager" aria-label="Pages">
          {view.page > 1 ? (
            <Link href={viewHref(slug, { ...view, page: view.page - 1 })}>Previous</Link>
          ) : (
            <span aria-disabled="true">Previous</span>
          )}
          <Text subtle>
            Page {view.page} of {pages.value}
          </Text>
          {view.page < pages.value ? (
            <Link href={viewHref(slug, { ...view, page: view.page + 1 })}>Next</Link>
          ) : (
            <span aria-disabled="true">Next</span>
          )}
        </nav>
      )}
    </Stack>
  )
}
