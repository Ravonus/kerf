import 'server-only'
import { asc, eq, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { z } from 'zod'
import { db } from '@/db'
import { cartItems, products } from '@/db/schema'

export const cartCookie = 'cart'

/** The visitor's cart id, if the cookie holds one. */
export async function cartId() {
  await connection()
  const id = z.uuid().safeParse((await cookies()).get(cartCookie)?.value)
  return id.success ? id.data : null
}

export async function countCart(id: string) {
  const [{ count }] = await db.select({ count: sql<number>`coalesce(sum(${cartItems.quantity}), 0)`.mapWith(Number) }).from(cartItems).where(eq(cartItems.cartId, id))
  return count
}

export async function loadCartCount() {
  const id = await cartId()
  return id ? countCart(id) : 0
}

export type CartLine = { id: number; slug: string; name: string; priceCents: number; stock: number; quantity: number }

export async function loadCart(): Promise<CartLine[]> {
  const id = await cartId()
  if (!id) return []
  return db.select({ id: products.id, slug: products.slug, name: products.name, priceCents: products.priceCents, stock: products.stock, quantity: cartItems.quantity })
    .from(cartItems).innerJoin(products, eq(products.id, cartItems.productId)).where(eq(cartItems.cartId, id)).orderBy(asc(products.name), asc(products.id))
}
