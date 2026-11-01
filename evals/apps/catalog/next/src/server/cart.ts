'use server'

import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { refresh } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'
import { db } from '@/db'
import { cartItems, carts, products } from '@/db/schema'
import { cartCookie, cartId, countCart } from './cart-data'

const sixtyDays = 60 * 60 * 24 * 60
const most = 99
const productId = z.number().int().positive().max(2147483647)
const amount = z.number().int().min(0).max(most)

const stockOf = async (id: number) => (await db.select({ stock: products.stock }).from(products).where(eq(products.id, id)))[0]?.stock

export async function addToCart(rawProductId: number) {
  const product = productId.parse(rawProductId)
  const stock = await stockOf(product)
  const known = await cartId()
  if (!stock) return { added: false, count: known ? await countCart(known) : null }
  const id = known ?? randomUUID()
  // Also for a known cookie: carts can be purged while the cookie lives on.
  await db.insert(carts).values({ id }).onConflictDoNothing()
  await db.insert(cartItems).values({ cartId: id, productId: product, quantity: 1 }).onConflictDoUpdate({
    target: [cartItems.cartId, cartItems.productId],
    set: { quantity: sql`least(${cartItems.quantity} + 1, ${Math.min(stock, most)})` },
  })
  const secure = (await headers()).get('x-forwarded-proto') === 'https'
  if (!known) (await cookies()).set(cartCookie, id, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: sixtyDays, secure })
  return { added: true, count: await countCart(id) }
}

/** The same add, from a form posted before hydration. */
export async function addToCartFromForm(form: FormData) {
  await addToCart(Number(form.get('productId')))
}

// The number asked for, not a step, so a repeated press lands in the same place. Zero takes the line out.
export async function setQuantity(rawProductId: number, rawQuantity: number) {
  const id = await cartId()
  if (!id) return 0
  const product = productId.parse(rawProductId), quantity = amount.parse(rawQuantity)
  const line = and(eq(cartItems.cartId, id), eq(cartItems.productId, product))
  const stock = await stockOf(product)
  if (stock !== undefined && quantity) await db.update(cartItems).set({ quantity: Math.min(quantity, stock) }).where(line)
  else if (stock !== undefined) await db.delete(cartItems).where(line)
  refresh()
  return countCart(id)
}
