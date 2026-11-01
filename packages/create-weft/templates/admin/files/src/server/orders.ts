import { mutation, query } from '@weft/start'
import { and, asc, count, desc, eq, ilike, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { customers, orderItems, orders, products } from '#/db/schema'
import { PAGE_SIZE, sortKeys, statuses } from '#/lib/orders'

const status = z.enum(statuses)
const sortColumns = { id: orders.id, customer: customers.name, status: orders.status, total: orders.totalCents, created: orders.createdAt }
const like = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`

const listed = { id: orders.id, customer: customers.name, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt }
const onTheWire = <T extends { createdAt: Date }>(row: T) => ({ ...row, createdAt: row.createdAt.toISOString() })

export type OrderRow = ReturnType<typeof onTheWire<{ id: number; customer: string; status: string; totalCents: number; createdAt: Date }>>

export const storeStats = query({
  tags: ['orders', 'customers'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [[sales], customerCount] = await Promise.all([
      ctx.db.select({
        revenue: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} <> 'refunded'), 0)`.mapWith(Number),
        refunded: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'refunded'), 0)`.mapWith(Number),
        orders: count(),
      }).from(orders),
      ctx.db.$count(customers),
    ])
    return { ...sales!, customers: customerCount }
  },
})

export const revenueByMonth = query({
  tags: ['orders'],
  auth: 'user',
  run: async ({ ctx }) => {
    const month = sql`date_trunc('month', ${orders.createdAt} at time zone 'UTC')`
    const rows = await ctx.db.select({
      month: sql<string>`to_char(${month}, 'Mon YYYY')`,
      cents: sql<number>`sum(${orders.totalCents})`.mapWith(Number),
    }).from(orders)
      .where(sql`${orders.status} <> 'refunded'`)
      .groupBy(month)
      .orderBy(desc(month))
      .limit(12)
    return rows.reverse().map(row => ({ month: row.month, revenue: row.cents / 100 }))
  },
})

export const latestOrders = query({
  tags: ['orders', 'customers'],
  auth: 'user',
  run: async ({ ctx }) => {
    const rows = await ctx.db.select(listed).from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(10)
    return rows.map(onTheWire)
  },
})

export const listOrders = query({
  input: z.object({
    page: z.number().int().min(1),
    sort: z.enum(sortKeys),
    dir: z.enum(['asc', 'desc']),
    status: status.or(z.literal('')),
    q: z.string().max(100),
  }),
  tags: ['orders', 'customers'],
  auth: 'user',
  run: async ({ input, ctx }) => {
    const where = and(input.status ? eq(orders.status, input.status) : undefined, input.q ? ilike(customers.name, like(input.q)) : undefined)
    const direction = input.dir === 'asc' ? asc : desc
    const [rows, [found]] = await Promise.all([
      ctx.db.select(listed).from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where)
        .orderBy(direction(sortColumns[input.sort]), direction(orders.id))
        .limit(PAGE_SIZE)
        .offset((input.page - 1) * PAGE_SIZE),
      ctx.db.select({ total: count() }).from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(where),
    ])
    return { rows: rows.map(onTheWire), total: found!.total }
  },
})

export const getOrder = query({
  input: z.object({ id: z.number().int().positive() }),
  tags: ['orders', 'customers', 'order_items', 'products'],
  auth: 'user',
  run: async ({ input, ctx }) => {
    const [[order], items] = await Promise.all([
      ctx.db.select({ ...listed, email: customers.email, city: customers.city }).from(orders)
        .innerJoin(customers, eq(customers.id, orders.customerId))
        .where(eq(orders.id, input.id)),
      ctx.db.select({ id: orderItems.id, product: products.name, quantity: orderItems.quantity, priceCents: orderItems.priceCents }).from(orderItems)
        .innerJoin(products, eq(products.id, orderItems.productId))
        .where(eq(orderItems.orderId, input.id))
        .orderBy(asc(orderItems.id)),
    ])
    return order ? { ...onTheWire(order), items } : null
  },
})

export const setOrderStatus = mutation({
  input: z.object({ id: z.number().int().positive(), status }),
  auth: 'user',
  invalidates: ['orders'],
  run: async ({ input, ctx }) => {
    await ctx.db.update(orders).set({ status: input.status }).where(eq(orders.id, input.id))
  },
})

export const markShipped = mutation({
  input: z.object({ ids: z.array(z.number().int().positive()).min(1).max(PAGE_SIZE) }),
  auth: 'user',
  invalidates: ['orders'],
  run: async ({ input, ctx }) => {
    await ctx.db.update(orders).set({ status: 'shipped' }).where(inArray(orders.id, input.ids))
  },
})
