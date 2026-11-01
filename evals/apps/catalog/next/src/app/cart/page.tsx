import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CartLines } from '@/components/cart-lines'
import { loadCart } from '@/server/cart-data'

export const metadata: Metadata = { title: 'Your cart', robots: { index: false } }

async function Lines() {
  return <CartLines lines={await loadCart()} />
}

export default function Cart() {
  return (
    <div className="mx-auto flex max-w-290 flex-col gap-5 px-8 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your cart</h1>
      <Suspense fallback={<div aria-hidden="true" className="h-40 animate-pulse rounded-2xl bg-tint" />}>
        <Lines />
      </Suspense>
    </div>
  )
}
