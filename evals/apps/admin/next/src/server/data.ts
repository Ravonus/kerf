import 'server-only'
import { and, asc, count, desc, eq, ilike, ne, type SQL, sql, sum } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db } from '@/db'
import { customers, orderItems, orders, products } from '@/db/schema'
import { type OrderRow, type OrdersQuery, pageSize, type SortKey } from '@/lib/orders'

export const ordersTag = 'orders'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })
export const money = (cents: number) => usd.format(cents / 100)
export const date = (at: Date) => day.format(at)

const row = { id: orders.id, customer: customers.name, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt }
type Selected = { id: number; customer: string; status: string; totalCents: number; createdAt: Date }
const present = ({ totalCents, createdAt, ...rest }: Selected): OrderRow => ({ ...rest, total: money(totalCents), date: date(createdAt) })

const sortColumns: Record<SortKey, typeof orders.id | typeof customers.name | typeof orders.status | typeof orders.totalCents | typeof orders.createdAt> = {
  id: orders.id,
  customer: customers.name,
  status: orders.status,
  total: orders.totalCents,
  created: orders.createdAt,
}

// Aggregates over every order, the same for every admin, and worth keeping for a minute. Every write here clears the tag, and a
// caller has to pass currentUser() first, so none of this reaches the public static shell.
export async function loadStats() {
  'use cache'
  cacheTag(ordersTag)
  cacheLife({ stale: 30, revalidate: 60, expire: 300 })
  const [[totals], customerCount] = await Promise.all([
    db.select({
      revenue: sum(orders.totalCents).mapWith(Number),
      orders: count(),
      refunded: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} = 'refunded'), 0)`.mapWith(Number),
    }).from(orders),
    db.$count(customers),
  ])
  return {
    revenue: money(totals.revenue - totals.refunded),
    orders: totals.orders.toLocaleString('en-US'),
    customers: customerCount.toLocaleString('en-US'),
    refunded: money(totals.refunded),
  }
}

export async function loadRevenueByMonth() {
  'use cache'
  cacheTag(ordersTag)
  cacheLife({ stale: 30, revalidate: 60, expire: 300 })
  const month = sql<string>`to_char(${orders.createdAt} at time zone 'UTC', 'YYYY-MM')`
  const rows = await db.select({ month, cents: sum(orders.totalCents).mapWith(Number) }).from(orders)
    .where(ne(orders.status, 'refunded')).groupBy(month).orderBy(desc(month)).limit(12)
  return rows.reverse()
}

export async function loadLatestOrders(limit: number) {
  const rows = await db.select(row).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit)
  return rows.map(present)
}

export async function loadOrders({ page, sort, dir, status, q }: OrdersQuery) {
  const name: SQL | undefined = q ? ilike(customers.name, `%${q.replace(/[\\%_]/g, '\\$&')}%`) : undefined
  const where = and(status && eq(orders.status, status), name), direction = dir === 'asc' ? asc : desc
  const [rows, [{ total }]] = await Promise.all([
    db.select(row).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where)
      .orderBy(direction(sortColumns[sort]), direction(orders.id)).limit(pageSize).offset((page - 1) * pageSize),
    q
      ? db.select({ total: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where)
      : db.select({ total: count() }).from(orders).where(where),
  ])
  return { rows: rows.map(present), total }
}

export async function loadOrder(id: number) {
  const [[order], items] = await Promise.all([
    db.select({
      id: orders.id,
      status: orders.status,
      totalCents: orders.totalCents,
      createdAt: orders.createdAt,
      customer: customers.name,
      email: customers.email,
      city: customers.city,
    }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(eq(orders.id, id)),
    db.select({ id: orderItems.id, name: products.name, quantity: orderItems.quantity, priceCents: orderItems.priceCents })
      .from(orderItems).innerJoin(products, eq(products.id, orderItems.productId)).where(eq(orderItems.orderId, id)).orderBy(orderItems.id),
  ])
  return order ? { ...order, items } : null
}

const revenue = sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number)

export async function loadReach() {
  const [row] = await db.select({ customers: count(), cities: sql<number>`count(distinct ${customers.city})`.mapWith(Number) }).from(customers)
  return row
}

export function loadTopCities() {
  return db.select({ city: customers.city, orders: count(), revenue }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId))
    .groupBy(customers.city).orderBy(desc(revenue))
}

export function loadBiggestCustomers() {
  return db.select({ id: customers.id, name: customers.name, city: customers.city, revenue }).from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId)).groupBy(customers.id).orderBy(desc(revenue)).limit(5)
}

export function loadRecentOrderRefs(limit: number) {
  return db.select({ id: orders.id, customerId: orders.customerId, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt })
    .from(orders).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit)
}

export async function loadCustomer(id: number) {
  const [customer] = await db.select({ name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, id))
  return customer
}

export async function loadSlowReport() {
  await db.execute(sql`select pg_sleep(2)`)
  return db.select({ status: orders.status, orders: count(), revenue }).from(orders).groupBy(orders.status).orderBy(desc(revenue))
}
