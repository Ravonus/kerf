-- One schema for every variant of every app in examples: landing, todo, admin, catalog.
-- Better Auth's tables keep its default camelCase names, so every stack can use it unconfigured.
create table "user" (
  id varchar(255) primary key, name text not null, email varchar(255) not null unique, "emailVerified" boolean not null,
  image text, "createdAt" timestamptz not null, "updatedAt" timestamptz not null
);
create table session (
  id varchar(255) primary key, "expiresAt" timestamptz not null, token varchar(255) not null unique,
  "createdAt" timestamptz not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text,
  "userId" varchar(255) not null references "user" (id) on delete cascade
);
create table account (
  id varchar(255) primary key, "accountId" text not null, "providerId" text not null,
  "userId" varchar(255) not null references "user" (id) on delete cascade,
  "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz,
  scope text, password text, "createdAt" timestamptz not null, "updatedAt" timestamptz not null
);
create table verification (
  id varchar(255) primary key, identifier text not null, value text not null, "expiresAt" timestamptz not null,
  "createdAt" timestamptz, "updatedAt" timestamptz
);
create table jwks (
  id varchar(255) primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null,
  "expiresAt" timestamptz, alg text, crv text
);

create table waitlist (id uuid primary key default gen_random_uuid(), email text not null unique, created_at timestamptz not null default now());

create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id varchar(255) not null references "user" (id) on delete cascade,
  title text not null, done boolean not null default false, created_at timestamptz not null default now()
);
create index todos_user on todos (user_id, created_at, id);

create table customers (id serial primary key, name text not null, email text not null unique, city text not null);
create table orders (
  id serial primary key, customer_id integer not null references customers (id), status text not null,
  total_cents integer not null, created_at timestamptz not null
);
create index orders_created on orders (created_at desc, id desc);
create index orders_status on orders (status, created_at desc);
create index orders_customer on orders (customer_id);

create table categories (id serial primary key, slug text not null unique, name text not null);
create table products (
  id serial primary key, slug text not null unique, name text not null, description text not null,
  category_id integer not null references categories (id), price_cents integer not null, stock integer not null, featured boolean not null default false
);
create index products_category on products (category_id, price_cents, id);

create table order_items (
  id serial primary key, order_id integer not null references orders (id) on delete cascade,
  product_id integer not null references products (id), quantity integer not null, price_cents integer not null
);
create index order_items_order on order_items (order_id);

create table carts (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table cart_items (
  cart_id uuid not null references carts (id) on delete cascade, product_id integer not null references products (id),
  quantity integer not null, primary key (cart_id, product_id)
);
