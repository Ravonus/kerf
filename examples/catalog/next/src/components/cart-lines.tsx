'use client'

import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { money } from '@/lib/format'
import type { CartLine } from '@/server/cart-data'
import { setQuantity } from '@/server/cart'
import { useCart } from './cart-provider'
import { ProductArt } from './product-card'

const step =
  'inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-line bg-surface hover:bg-tint disabled:cursor-default disabled:opacity-50'

type Change = { id: number; quantity: number }

export function CartLines({ lines }: { lines: CartLine[] }) {
  const { setLatest, move } = useCart()
  const [failed, setFailed] = useState(false)
  const [, start] = useTransition()
  const [shown, show] = useOptimistic(lines, (now, { id, quantity }: Change) =>
    now.flatMap((line) => (line.id !== id ? [line] : quantity ? [{ ...line, quantity }] : [])),
  )

  const change = ({ id, quantity: was }: CartLine, quantity: number) =>
    start(async () => {
      setFailed(false)
      show({ id, quantity })
      move(quantity - was)
      try {
        const count = await setQuantity(id, quantity)
        start(() => setLatest(count))
      } catch {
        setFailed(true)
      }
    })

  if (!shown.length) {
    return (
      <div className="flex flex-col items-start gap-1 py-12">
        <h2 className="text-xl font-semibold tracking-tight">Your cart is empty</h2>
        <p className="text-muted">Everything you add stays here for sixty days.</p>
        <Link href="/" className="font-medium text-accent-text hover:underline">
          Back to the aisles
        </Link>
      </div>
    )
  }
  const subtotal = shown.reduce((sum, line) => sum + line.priceCents * line.quantity, 0)
  return (
    <>
      {failed && (
        <p role="alert" className="font-medium text-danger">
          That didn't save. Your cart is back as it was. Try again in a moment.
        </p>
      )}
      <ul aria-label="Cart">
        {shown.map((line) => (
          <li
            key={line.id}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2.5 border-b border-line py-2.5 md:grid-cols-[4.5rem_minmax(0,1fr)_auto_5.5rem_auto]"
          >
            <ProductArt name={line.name} />
            <div>
              <Link href={`/p/${line.slug}`}>{line.name}</Link>
              <p className="text-muted">{money(line.priceCents)} each</p>
            </div>
            <div className="inline-flex items-center gap-1 tabular-nums">
              <button
                type="button"
                aria-label={`One fewer ${line.name}`}
                onClick={() => change(line, line.quantity - 1)}
                className={step}
              >
                −
              </button>
              <span aria-label={`Quantity of ${line.name}`}>{line.quantity}</span>
              <button
                type="button"
                aria-label={`One more ${line.name}`}
                disabled={line.quantity >= Math.min(line.stock, 99)}
                onClick={() => change(line, line.quantity + 1)}
                className={step}
              >
                +
              </button>
            </div>
            <span className="text-end font-semibold tabular-nums">
              {money(line.priceCents * line.quantity)}
            </span>
            <button
              type="button"
              aria-label={`Remove ${line.name}`}
              onClick={() => change(line, 0)}
              className="cursor-pointer text-sm font-medium text-accent-text hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between text-xl">
        <p className="text-muted">Subtotal</p>
        <span className="font-semibold tabular-nums">{money(subtotal)}</span>
      </div>
      <p className="text-muted">Checkout opens soon. Your cart keeps until then.</p>
    </>
  )
}
