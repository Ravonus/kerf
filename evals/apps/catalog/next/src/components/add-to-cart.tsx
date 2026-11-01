'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { addToCart, addToCartFromForm } from '@/server/cart'
import { useCart } from './cart-provider'

// The count only moves once the add is stored: an optimistic one would be lost by a reload that beats the reply, cookie and all.
// One add at a time, or two first adds would make two carts. The form's action catches a click from before hydration.
export function AddToCart({ productId, soldOut }: { productId: number; soldOut: boolean }) {
  const { setLatest } = useCart()
  const [adding, start] = useTransition()
  const [note, setNote] = useState<'added' | 'gone' | 'failed' | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adding) return
    setNote(null)
    start(async () => {
      try {
        const { count, added } = await addToCart(productId)
        start(() => { setNote(added ? 'added' : 'gone'); if (count !== null) setLatest(count) })
      } catch {
        setNote('failed')
      }
    })
  }

  return (
    <form action={addToCartFromForm} onSubmit={submit} className="flex flex-col gap-1">
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" disabled={soldOut} aria-disabled={adding} className="h-12 w-full cursor-pointer rounded-full bg-accent px-6 font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-default disabled:opacity-50 aria-disabled:opacity-70">
        Add to cart
      </button>
      {note === 'gone' && <p role="alert" className="text-sm font-medium text-danger">That one just sold out.</p>}
      {note === 'failed' && <p role="alert" className="text-sm font-medium text-danger">That wasn't added. Please try again.</p>}
      <p role="status" className="text-sm font-medium text-success">{note === 'added' ? 'In your cart.' : ''}</p>
    </form>
  )
}
