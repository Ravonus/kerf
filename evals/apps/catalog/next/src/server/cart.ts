'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db'
import { cartItems, carts, products } from '@/db/schema'
import { cartCookie, cartId, countCart } from './cart-data'

const productId = z.number().int().positive().max(2147483647)

export async function addToCart(rawProductId: number) {
  const product = productId.parse(rawProductId)
  const id = await cartId() ?? randomUUID()
  // Also for a known cookie: carts can be purged while the cookie lives on.
  await db.insert(carts).values({ id }).onConflictDoNothing()
  await db.execute(sql`
    insert into ${cartItems} (cart_id, product_id, quantity)
    select ${id}, ${products.id}, 1 from ${products} where ${products.id} = ${product} and ${products.stock} > 0
    on conflict (cart_id, product_id) do update set quantity = ${cartItems}.quantity + 1`)
  ;(await cookies()).set(cartCookie, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 })
  return countCart(id)
}

/** The same add, from a form posted before hydration. */
export async function addToCartFromForm(form: FormData) {
  await addToCart(Number(form.get('productId')))
}

export async function removeFromCart(rawProductId: number) {
  const id = await cartId()
  if (!id) return 0
  await db.delete(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.productId, productId.parse(rawProductId))))
  refresh()
  return countCart(id)
}
