import { boolean, index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

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

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    createdAt: stamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("todos_user").on(t.userId, t.createdAt, t.id)],
);
