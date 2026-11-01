import { boolean, index, integer, pgTable, primaryKey, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  categoryId: integer('category_id').notNull().references(() => categories.id),
  priceCents: integer('price_cents').notNull(),
  stock: integer('stock').notNull(),
  featured: boolean('featured').notNull().default(false),
}, table => [index('products_category').on(table.categoryId, table.priceCents, table.id)])

export const carts = pgTable('carts', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cartItems = pgTable('cart_items', {
  cartId: uuid('cart_id').notNull().references(() => carts.id, { onDelete: 'cascade' }),
  productId: integer('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
}, table => [primaryKey({ columns: [table.cartId, table.productId] })])
