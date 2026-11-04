'use server'

import { json, reload } from '@solidjs/router'
import { and, asc, eq, sql } from 'drizzle-orm'
import { getRequestEvent } from 'solid-js/web'

import { db } from '~/db/index.server'
import { cartItems, products } from '~/db/schema'

const SIXTY_DAYS = 60 * 60 * 24 * 60
const MOST = 99

// Read from the request, not h3's cookie helpers: a single-flight refetch replaces the request and that's where a new cart's id is.
function cartId() {
  return getRequestEvent()!
    .request.headers.get('cookie')
    ?.match(
      /(?:^|;\s*)cart=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:;|$)/,
    )?.[1]
}

function startCart() {
  const event = getRequestEvent()!
  const id = crypto.randomUUID()
  const secure = new URL(event.request.url).protocol === 'https:' ? '; Secure' : ''
  event.response.headers.append(
    'set-cookie',
    `cart=${id}; Path=/; Max-Age=${SIXTY_DAYS}; HttpOnly; SameSite=Lax${secure}`,
  )
  return id
}

// The current route's preload answers these in the action's own reply.
const revalidate = ['cart-count', 'cart']

const productId = (form: FormData) => {
  const id = Number(form.get('product'))
  return Number.isInteger(id) && id > 0 && id < 2 ** 31 ? id : null
}

export async function loadCartCount() {
  const id = cartId()
  if (!id) return 0
  const [row] = await db
    .select({ n: sql`coalesce(sum(${cartItems.quantity}), 0)`.mapWith(Number) })
    .from(cartItems)
    .where(eq(cartItems.cartId, id))
  return row!.n
}

export async function loadCart() {
  const id = cartId()
  if (!id) return []
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      priceCents: products.priceCents,
      stock: products.stock,
      quantity: cartItems.quantity,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, id))
    .orderBy(asc(products.name), asc(products.id))
}

export async function addItem(form: FormData) {
  const product = productId(form)
  const [found] = product
    ? await db.select({ stock: products.stock }).from(products).where(eq(products.id, product))
    : []
  if (!found?.stock)
    return json(
      { added: false, error: 'That one just sold out.' },
      { revalidate: ['cart-count', 'product'] },
    )
  const id = cartId() ?? startCart()
  // The cookie can outlive the row, so the cart is made sure of on every add.
  await db.execute(sql`
    with cart as (insert into carts (id) values (${id}) on conflict do nothing)
    insert into cart_items (cart_id, product_id, quantity) values (${id}, ${product}, 1)
    on conflict (cart_id, product_id) do update set quantity = least(cart_items.quantity + 1, ${Math.min(found.stock, MOST)})
  `)
  return json({ added: true, error: undefined }, { revalidate })
}

// The number asked for, not a step, so a repeated press lands in the same place. Zero takes the line out.
export async function setItem(form: FormData) {
  const id = cartId()
  const product = productId(form)
  const quantity = Number(form.get('quantity'))
  if (id && product && Number.isInteger(quantity) && quantity >= 0 && quantity <= MOST) {
    const line = and(eq(cartItems.cartId, id), eq(cartItems.productId, product))
    const [found] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, product))
    if (found && quantity)
      await db
        .update(cartItems)
        .set({ quantity: Math.min(quantity, found.stock) })
        .where(line)
    else if (found) await db.delete(cartItems).where(line)
  }
  return reload({ revalidate })
}
