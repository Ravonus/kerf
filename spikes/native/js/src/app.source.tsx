// Not compiled in the spike. This is the source an agent writes; app.ts is its hand-lowered form, which is what
// the `native` compiler backend has to produce. Same file runs on web (dom backend) and native.
// @ts-nocheck
import { state, derived } from 'weft'
import { Stack, Row, Text, Button, Input, Scroll } from '@weft/warp'

export function ProductRow({ product, left, onAdd }: { product: Product; left: number; onAdd: (id: string) => void }) {
  return (
    <Row gap="related" align="center">
      <Text grow={1}>{product.name}</Text>
      <Text label={`${product.name} price`}>{money(product.price)}</Text>
      <Text role="caption">{left <= 0 ? 'Out of stock' : left <= 3 ? `Only ${left} left` : ''}</Text>
      <Button label={`Add ${product.name}`} disabled={left <= 0} onTap={() => onAdd(product.id)}>Add</Button>
    </Row>
  )
}

export function ProductList({ products, cart, filters, onAdd }: Props) {
  const shown = derived(() => /* filter + sort, as in app.ts */ products)
  return (
    <Stack gap="related" grow={1}>
      <Input label="Search" value={filters.value.search} onInput={search => filters.value = { ...filters.value, search }} />
      <Text role="caption">{shown.value.length === 1 ? '1 product' : `${shown.value.length} products`}</Text>
      <Scroll gap="related" grow={1} label="Products">
        {shown.value.map(p => <ProductRow key={p.id} product={p} left={p.stock - (cart[p.id] ?? 0)} onAdd={onAdd} />)}
      </Scroll>
    </Stack>
  )
}
