'use client'

import { useTransition } from 'react'
import { removeFromCart } from '@/server/cart'
import { useCart } from './cart-provider'

export function RemoveFromCart({ productId, name }: { productId: number; name: string }) {
  const { setLatest } = useCart()
  const [removing, start] = useTransition()
  const remove = () => start(async () => {
    const count = await removeFromCart(productId)
    start(() => setLatest(count))
  })
  return (
    <button type="button" aria-label={`Remove ${name}`} disabled={removing} onClick={remove} className="text-sm font-medium text-accent hover:underline disabled:opacity-60">
      Remove
    </button>
  )
}
