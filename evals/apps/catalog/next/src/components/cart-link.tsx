'use client'

import Link from 'next/link'
import { useCart } from './cart-provider'

export function CartLink({ count }: { count?: number }) {
  const known = useCart().latest ?? count
  return (
    <Link href="/cart" className="rounded-lg border border-line bg-raised px-3 py-1.5 text-sm font-medium tabular-nums hover:border-accent">
      {known === undefined ? 'Cart' : `Cart (${known})`}
    </Link>
  )
}
