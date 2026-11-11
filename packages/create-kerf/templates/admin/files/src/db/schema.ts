import { desc } from 'drizzle-orm'
import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export * from './auth'

export const customers = pgTable('customers', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  city: text('city').notNull(),
})

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    customerId: integer('customer_id')
      .notNull()
      .references(() => customers.id),
    status: text('status').notNull(),
    totalCents: integer('total_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('orders_created').on(desc(table.createdAt), desc(table.id)),
    index('orders_status').on(table.status, desc(table.createdAt)),
    index('orders_customer').on(table.customerId),
  ],
)

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const products = pgTable(
  'products',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    priceCents: integer('price_cents').notNull(),
    stock: integer('stock').notNull(),
    featured: boolean('featured').notNull().default(false),
  },
  (table) => [index('products_category').on(table.categoryId, table.priceCents, table.id)],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: integer('product_id')
      .notNull()
      .references(() => products.id),
    quantity: integer('quantity').notNull(),
    priceCents: integer('price_cents').notNull(),
  },
  (table) => [index('order_items_order').on(table.orderId)],
)
