'use client'

import { createContext, type ReactNode, use, useState } from 'react'

type Cart = { latest: number | null; setLatest: (count: number) => void }

const CartContext = createContext<Cart | null>(null)

/** The count the last cart action came back with: the layout's own stays as it was until a full load. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<number | null>(null)
  return <CartContext value={{ latest, setLatest }}>{children}</CartContext>
}

export function useCart() {
  const cart = use(CartContext)
  if (!cart) throw new Error('useCart needs a CartProvider')
  return cart
}
