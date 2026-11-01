import { boolean, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
})

export const products = pgTable('products', {
  id: serial().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  description: text().notNull(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  priceCents: integer('price_cents').notNull(),
  stock: integer().notNull(),
  featured: boolean().notNull().default(false),
})

export const carts = pgTable('carts', {
  id: uuid().primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cartItems = pgTable('cart_items', {
  cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer().notNull(),
}, table => [primaryKey({ columns: [table.cartId, table.productId] })])
