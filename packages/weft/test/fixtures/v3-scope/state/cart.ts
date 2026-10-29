import { defineState, derived, state } from 'weft'
import type { Product } from '../api'

export type CartLine = { qty: number; addedPrice: number }

export const cart = defineState('cart', () => {
  const lines = state<Record<string, CartLine>>({})
  const count = derived(() => Object.values(lines.value).reduce((n, l) => n + l.qty, 0))
  return {
    lines,
    count,
    /** One entry: the reader re-runs only when this product's line changes. */
    line: (id: string) => lines.get(id),
    change(product: Product, delta: number) {
      const line = lines.get(product.id)
      const qty = (line?.qty ?? 0) + delta
      if (qty > product.stock) return
      lines.set(d => {
        if (qty <= 0) delete d[product.id]
        else d[product.id] = { qty, addedPrice: line?.addedPrice ?? product.price }
      })
    },
  }
})
