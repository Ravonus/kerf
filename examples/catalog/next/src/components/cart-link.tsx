'use client'

import Link from 'next/link'
import { useCart } from './cart-provider'

export function CartLink({ count }: { count?: number }) {
  const { latest, moved } = useCart()
  const known = latest ?? count
  return (
    <Link
      href="/cart"
      className="min-w-20 rounded-full border border-line px-3 py-1 text-center tabular-nums hover:border-accent hover:text-accent-text"
    >
      {known === undefined ? 'Cart' : `Cart (${known + moved})`}
    </Link>
  )
}
