import type { Product } from './api'

/** How many more of `product` can be added to a cart that already holds `inCart` of it. */
export const canAddMore = (product: Product, inCart: number) => Math.max(0, product.stock - inCart)
