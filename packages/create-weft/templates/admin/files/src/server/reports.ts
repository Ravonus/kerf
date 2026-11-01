import { query } from '@weft/start'
import { count, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { customers, orders } from '#/db/schema'

const revenue = sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number)

/** The whole store, for the band above the regions. */
export const reach = query({
  tags: ['customers'],
  auth: 'user',
  run: async ({ ctx }) => {
    const [row] = await ctx.db.select({ customers: count(), cities: sql<number>`count(distinct ${customers.city})`.mapWith(Number) }).from(customers)
    return row!
  },
})

export const topCities = query({
  tags: ['orders', 'customers'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db.select({ city: customers.city, orders: count(), revenue }).from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .groupBy(customers.city)
      .orderBy(desc(revenue)),
})

export const biggestCustomers = query({
  tags: ['orders', 'customers'],
  auth: 'user',
  run: ({ ctx }) =>
    ctx.db.select({ id: customers.id, name: customers.name, city: customers.city, revenue }).from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .groupBy(customers.id)
      .orderBy(desc(revenue))
      .limit(5),
})

export const recentOrderIds = query({
  tags: ['orders'],
  auth: 'user',
  run: async ({ ctx }) => {
    const rows = await ctx.db.select({ id: orders.id, customerId: orders.customerId, status: orders.status, totalCents: orders.totalCents }).from(orders)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(50)
    return rows
  },
})

export const getCustomer = query({
  input: z.object({ id: z.number().int().positive() }),
  tags: ['customers'],
  auth: 'user',
  run: async ({ input, ctx }) => {
    const [customer] = await ctx.db.select({ name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, input.id))
    return customer ?? null
  },
})

// The year's books take a while to add up.
export const yearReport = query({
  tags: ['orders'],
  auth: 'user',
  run: async ({ ctx }) => {
    await ctx.db.execute(sql`select pg_sleep(2)`)
    return ctx.db.select({ status: orders.status, orders: count(), revenue }).from(orders)
      .groupBy(orders.status)
      .orderBy(desc(revenue))
  },
})
