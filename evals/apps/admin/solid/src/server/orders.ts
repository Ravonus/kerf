"use server";

import { reload } from "@solidjs/router";
import { and, asc, count, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "~/db/index.server";
import { customers, orderItems, orders, products } from "~/db/schema";
import { pageSize, parseSearch, statuses, type OrderSearch } from "~/lib/search";
import { requireUser } from "./auth.server";

const Id = z.coerce.number().int().positive().max(2147483647);
const Status = z.enum(statuses);

const sortColumns = { id: orders.id, customer: customers.name, status: orders.status, total: orders.totalCents, created: orders.createdAt };

// Every key a change of status can touch. The ones the current route preloads come back in the reply.
const answer = () => reload({ revalidate: ["orders", "order-detail", "overview", "top-cities", "biggest-customers", "recent-orders", "report"] });

const money = (expr: ReturnType<typeof sql>) => sql`coalesce(${expr}, 0)`.mapWith(Number);
const cents = money(sql`sum(${orders.totalCents})`);
const listed = { id: orders.id, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt, customer: customers.name };

function latest(limit: number) {
  return db.select(listed).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).orderBy(desc(orders.createdAt), desc(orders.id)).limit(limit);
}

export async function loadOverview() {
  await requireUser();
  const [[stats], months, recent] = await Promise.all([
    db
      .select({
        revenue: money(sql`sum(${orders.totalCents}) filter (where ${orders.status} <> 'refunded')`),
        orders: count(),
        customers: sql`(select count(*) from ${customers})`.mapWith(Number),
        refunded: money(sql`sum(${orders.totalCents}) filter (where ${orders.status} = 'refunded')`),
      })
      .from(orders),
    db
      .select({ month: sql<string>`to_char(${orders.createdAt} at time zone 'UTC', 'YYYY-MM')`, cents })
      .from(orders)
      .where(ne(orders.status, "refunded"))
      .groupBy(sql`1`)
      .orderBy(sql`1 desc`)
      .limit(12),
    latest(10),
  ]);
  return { stats: stats!, months: months.reverse(), recent };
}

export async function loadOrders(raw: OrderSearch) {
  await requireUser();
  const s = parseSearch(raw);
  const like = s.q && `%${s.q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(s.status && eq(orders.status, s.status), like ? ilike(customers.name, like) : undefined);
  const dir = s.dir === "asc" ? asc : desc;
  const [rows, [total]] = await Promise.all([
    db
      .select(listed)
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(where)
      .orderBy(...(s.sort === "id" ? [dir(orders.id)] : [dir(sortColumns[s.sort]), dir(orders.id)]))
      .limit(pageSize)
      .offset((s.page - 1) * pageSize),
    like
      ? db.select({ n: count() }).from(orders).innerJoin(customers, eq(customers.id, orders.customerId)).where(where)
      : db.select({ n: count() }).from(orders).where(where),
  ]);
  return { rows, total: total!.n };
}

export async function loadOrder(rawId: number) {
  await requireUser();
  const id = Id.safeParse(rawId);
  if (!id.success) return null;
  const [[order], items] = await Promise.all([
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalCents: orders.totalCents,
        createdAt: orders.createdAt,
        customer: { name: customers.name, email: customers.email, city: customers.city },
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, id.data)),
    db
      .select({ id: orderItems.id, name: products.name, quantity: orderItems.quantity, priceCents: orderItems.priceCents })
      .from(orderItems)
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, id.data))
      .orderBy(orderItems.id),
  ]);
  return order ? { ...order, items } : null;
}

export async function loadReach() {
  await requireUser();
  const [row] = await db.select({ customers: count(), cities: sql`count(distinct ${customers.city})`.mapWith(Number) }).from(customers);
  return row!;
}

export async function loadTopCities() {
  await requireUser();
  return db
    .select({ city: customers.city, orders: count(), cents })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .groupBy(customers.city)
    .orderBy(desc(cents));
}

export async function loadBiggestCustomers() {
  await requireUser();
  return db
    .select({ id: customers.id, name: customers.name, city: customers.city, cents })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .groupBy(customers.id)
    .orderBy(desc(cents))
    .limit(5);
}

export async function loadRecentOrders() {
  await requireUser();
  return db
    .select({ id: orders.id, customerId: orders.customerId, status: orders.status, totalCents: orders.totalCents, createdAt: orders.createdAt })
    .from(orders)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(pageSize);
}

export async function loadCustomer(id: number) {
  await requireUser();
  const [customer] = await db.select({ name: customers.name, city: customers.city }).from(customers).where(eq(customers.id, Id.parse(id)));
  return customer ?? null;
}

export async function loadReport() {
  await requireUser();
  await db.execute(sql`select pg_sleep(2)`);
  return db.select({ status: orders.status, orders: count(), cents }).from(orders).groupBy(orders.status).orderBy(desc(cents));
}

export async function markOrdersShipped(form: FormData | URLSearchParams) {
  await requireUser();
  const ids = z.array(Id).max(pageSize).parse(form.getAll("id"));
  if (ids.length) await db.update(orders).set({ status: "shipped" }).where(inArray(orders.id, ids));
  return answer();
}

export async function setOrderStatus(id: number, status: string) {
  await requireUser();
  await db
    .update(orders)
    .set({ status: Status.parse(status) })
    .where(eq(orders.id, Id.parse(id)));
  return answer();
}
