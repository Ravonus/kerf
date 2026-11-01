import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { RemoveFromCart } from '@/components/remove-from-cart'
import { productArt } from '@/lib/art'
import { money } from '@/lib/format'
import { loadCart } from '@/server/cart-data'

export const metadata: Metadata = { title: 'Cart', robots: { index: false } }

async function Lines() {
  const lines = await loadCart()
  if (!lines.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted">Your cart is empty.</p>
        <Link href="/" className="font-medium text-accent hover:underline">Back to the shop</Link>
      </div>
    )
  }
  const total = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
  return (
    <>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-raised">
        {lines.map(line => {
          const { image, tile } = productArt(line.id)
          return (
            <li key={line.id} className="flex items-center gap-4 p-4">
              <Image src={image} alt="" width={64} height={64} className={`size-16 rounded-xl ${tile}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${line.slug}`} className="font-medium hover:text-accent">{line.name}</Link>
                <p className="text-sm text-muted tabular-nums">{line.quantity} × {money(line.priceCents)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="tabular-nums">{money(line.priceCents * line.quantity)}</span>
                <RemoveFromCart productId={line.id} name={line.name} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="flex justify-between text-lg font-semibold tabular-nums"><span>Total</span><span>{money(total)}</span></p>
    </>
  )
}

export default function Cart() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Cart</h1>
      <Suspense fallback={<div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-tint" />}>
        <Lines />
      </Suspense>
    </div>
  )
}
