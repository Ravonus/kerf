import { invalid, mutation, query, type Context } from '@kerf/start'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { cartItems, carts, products } from '#/db/schema'

const COOKIE = 'cart'
const SIXTY_DAYS = 60 * 60 * 24 * 60
const MOST = 99

/** This visitor's cart. One this same request started is only in the response so far, and the refreshed count has to find it. */
function cartOf(ctx: Context) {
  const cookies = [
    ...ctx.response.headers.getSetCookie(),
    ctx.request.headers.get('cookie') ?? '',
  ].join('; ')
  return cookies.match(
    /(?:^|;\s*)cart=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/,
  )?.[1]
}

function startCart(ctx: Context) {
  const id = crypto.randomUUID()
  const secure = new URL(ctx.request.url).protocol === 'https:' ? '; Secure' : ''
  ctx.response.headers.append(
    'set-cookie',
    `${COOKIE}=${id}; Path=/; Max-Age=${SIXTY_DAYS}; HttpOnly; SameSite=Lax${secure}`,
  )
  return id
}

export const cartCount = query({
  tags: ['cart_items'],
  run: async ({ ctx }) => {
    const cart = cartOf(ctx)
    if (!cart) return { count: 0 }
    const [row] = await ctx.db
      .select({ count: sql<number>`coalesce(sum(${cartItems.quantity}), 0)`.mapWith(Number) })
      .from(cartItems)
      .where(eq(cartItems.cartId, cart))
    return { count: row!.count }
  },
})

export const listCart = query({
  tags: ['cart_items', 'products'],
  run: async ({ ctx }) => {
    const cart = cartOf(ctx)
    if (!cart) return []
    return await ctx.db
      .select({
        slug: products.slug,
        name: products.name,
        priceCents: products.priceCents,
        stock: products.stock,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cart))
      .orderBy(asc(products.name), asc(products.id))
  },
})

export const addToCart = mutation({
  input: z.object({ slug: z.string().min(1).max(200) }),
  invalidates: ['carts', 'cart_items'],
  // Not optimistic: a first add's cart only exists once its cookie lands, so the count waits for the reply, not the click.
  run: async ({ input, ctx }) => {
    const [product] = await ctx.db
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(eq(products.slug, input.slug))
    if (!product?.stock) invalid({ slug: 'That one just sold out.' })
    const cart = cartOf(ctx) ?? startCart(ctx)
    // The cookie can outlive the row, so the cart is made sure of on every add.
    await ctx.db.insert(carts).values({ id: cart }).onConflictDoNothing()
    await ctx.db
      .insert(cartItems)
      .values({ cartId: cart, productId: product!.id, quantity: 1 })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.productId],
        set: { quantity: sql`least(${cartItems.quantity} + 1, ${Math.min(product!.stock, MOST)})` },
      })
    return { added: true }
  },
})

// `quantity` is the number asked for, not a step, so a repeated press lands in the same place. Zero takes the line out.
export const setQuantity = mutation({
  input: z.object({
    slug: z.string().min(1).max(200),
    quantity: z.number().int().min(0).max(MOST),
  }),
  invalidates: ['cart_items'],
  optimistic: ({ input }, cache) => {
    let change = 0
    cache.update(listCart, undefined, (lines) => {
      const at = lines.findIndex((line) => line.slug === input.slug)
      if (at < 0) return
      change = input.quantity - lines[at]!.quantity
      if (input.quantity) lines[at]!.quantity = input.quantity
      else lines.splice(at, 1)
    })
    if (cache.get(cartCount))
      cache.update(cartCount, undefined, (cart) => {
        cart.count += change
      })
  },
  run: async ({ input, ctx }) => {
    const cart = cartOf(ctx)
    if (!cart) return
    const [product] = await ctx.db
      .select({ id: products.id, stock: products.stock })
      .from(products)
      .where(eq(products.slug, input.slug))
    if (!product) return
    const line = and(eq(cartItems.cartId, cart), eq(cartItems.productId, product.id))
    if (input.quantity)
      await ctx.db
        .update(cartItems)
        .set({ quantity: Math.min(input.quantity, product.stock) })
        .where(line)
    else await ctx.db.delete(cartItems).where(line)
  },
})
