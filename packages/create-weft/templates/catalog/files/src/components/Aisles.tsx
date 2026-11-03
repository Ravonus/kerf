import { Link } from '@weft-js/start'
import { Skeleton, Text } from '@weft-js/warp'
import { listCategories } from '#/server/catalog'

export function Aisles({ current }: { current?: string }) {
  const aisles = listCategories()
  return (
    <>
      {aisles.value?.length === 0 && <Text subtle>The aisles are being set up. Check back soon.</Text>}
      <nav class="aisles" aria-label="Aisles" data-compact={current !== undefined ? '' : undefined}>
        {aisles.value?.map(aisle => (
          <Link key={aisle.slug} href={`/c/${aisle.slug}`} aria-current={aisle.slug === current ? 'page' : undefined}>{aisle.name}</Link>
        ))}
      </nav>
    </>
  )
}

export const AislesLoading = () => <div role="status" aria-label="Loading aisles"><Skeleton height="3rem" /></div>
