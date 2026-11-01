import { boolean, index, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

const stamp = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable("user", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: stamp("createdAt").notNull(),
  updatedAt: stamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
  id: varchar("id", { length: 255 }).primaryKey(),
  expiresAt: stamp("expiresAt").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: stamp("createdAt").notNull(),
  updatedAt: stamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: varchar("userId", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: varchar("userId", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: stamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: stamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: stamp("createdAt").notNull(),
  updatedAt: stamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: stamp("expiresAt").notNull(),
  createdAt: stamp("createdAt"),
  updatedAt: stamp("updatedAt"),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  city: text("city").notNull(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    status: text("status").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: stamp("created_at").notNull(),
  },
  (t) => [
    index("orders_created").on(t.createdAt.desc(), t.id.desc()),
    index("orders_status").on(t.status, t.createdAt.desc()),
    index("orders_customer").on(t.customerId),
  ],
);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  priceCents: integer("price_cents").notNull(),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull(),
    priceCents: integer("price_cents").notNull(),
  },
  (t) => [index("order_items_order").on(t.orderId)],
);
