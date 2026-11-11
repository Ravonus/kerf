import type { Product } from '../api'
import { group } from '@kerf-js/core/style'
import { money } from '../format'
import { action } from '../ui'

/** One product in the catalogue, with its stock level. */
export const productRow = group('product-row', {
  base: { layout: 'row', gap: 'related', padBlock: 'related', divide: 'hairline' },
  axes: { stock: { in: {}, low: {}, out: { ink: 'subtle' } } },
  parts: {
    name: { text: 'body', grow: 'fill' },
    price: { text: 'label', figures: 'tabular' },
    note: { text: 'caption', padInline: 'related', radius: 'round', emphasis: 'soft' },
  },
  compounds: [
    { when: { stock: 'low' }, part: 'note', set: { tone: 'caution' } },
    { when: { stock: 'out' }, part: 'note', set: { tone: 'neutral' } },
  ],
  defaults: { stock: 'in' },
})

export function ProductRow({
  product,
  left,
  onAdd,
}: {
  product: Product
  left: number
  onAdd: (id: string) => void
}) {
  return (
    <li {...productRow({ stock: left <= 0 ? 'out' : left <= 3 ? 'low' : 'in' })}>
      <span {...productRow.name} data-testid="name">
        {product.name}
      </span>
      <span {...productRow.price} data-testid="price">
        {money(product.price)}
      </span>
      {left <= 0 ? (
        <span {...productRow.note}>Out of stock</span>
      ) : left <= 3 ? (
        <span {...productRow.note}>Only {left} left</span>
      ) : null}
      <button
        {...action()}
        aria-label={`Add ${product.name}`}
        disabled={left <= 0}
        onClick={() => onAdd(product.id)}
      >
        Add
      </button>
    </li>
  )
}
