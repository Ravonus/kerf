'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { addToCart, addToCartFromForm } from '@/server/cart'
import { useCart } from './cart-provider'

// The count only moves once the add is stored: an optimistic one would be lost by a reload that beats the reply, cookie and all.
// One add at a time, or two first adds would make two carts. The form's action catches a click from before hydration.
export function AddToCart({ productId }: { productId: number }) {
  const { setLatest } = useCart()
  const [adding, start] = useTransition()
  const [failed, setFailed] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adding) return
    setFailed(false)
    start(async () => {
      try {
        const count = await addToCart(productId)
        start(() => setLatest(count))
      } catch {
        setFailed(true)
      }
    })
  }

  return (
    <form action={addToCartFromForm} onSubmit={submit}>
      <input type="hidden" name="productId" value={productId} />
      <button type="submit" aria-disabled={adding} className="h-12 w-full rounded-xl bg-accent px-6 font-semibold text-on-accent hover:bg-accent-strong aria-disabled:opacity-70 sm:w-auto">
        Add to cart
      </button>
      {failed && <p role="alert" className="mt-2 text-sm text-danger">That didn't reach your cart. Try again.</p>}
    </form>
  )
}
