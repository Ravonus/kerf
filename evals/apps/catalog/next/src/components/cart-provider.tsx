'use client'

import { createContext, type ReactNode, use, useOptimistic, useState } from 'react'

type Cart = {
  latest: number | null
  setLatest: (count: number) => void
  moved: number
  move: (by: number) => void
}

const CartContext = createContext<Cart | null>(null)

/** The count the last cart action came back with: the layout's own stays as it was until a full load. `moved` is what's still on its way. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<number | null>(null)
  const [moved, move] = useOptimistic(0, (sum, by: number) => sum + by)
  return <CartContext value={{ latest, setLatest, moved, move }}>{children}</CartContext>
}

export function useCart() {
  const cart = use(CartContext)
  if (!cart) throw new Error('useCart needs a CartProvider')
  return cart
}
