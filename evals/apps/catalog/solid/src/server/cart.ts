"use server";

import { json, reload } from "@solidjs/router";
import { and, asc, eq, sql } from "drizzle-orm";
import { getRequestEvent } from "solid-js/web";

import { db } from "~/db/index.server";
import { cartItems, products } from "~/db/schema";

// Read from the request, not h3's cookie helpers: a single-flight refetch replaces the request and that's where a new cart's id is.
function cartId() {
  return getRequestEvent()!.request.headers.get("cookie")?.match(/(?:^|;\s*)cart=([0-9a-f-]{36})(?:;|$)/)?.[1];
}

function startCart() {
  const event = getRequestEvent()!;
  const id = crypto.randomUUID();
  const secure = new URL(event.request.url).protocol === "https:" ? "; Secure" : "";
  event.response.headers.append("set-cookie", `cart=${id}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure}`);
  return id;
}

// The current route's preload answers these in the action's own reply.
const revalidate = ["cart-count", "cart"];

const productId = (form: FormData) => {
  const id = Number(form.get("product"));
  return Number.isInteger(id) && id > 0 && id < 2 ** 31 ? id : null;
};

export async function loadCartCount() {
  const id = cartId();
  if (!id) return 0;
  const [row] = await db
    .select({ n: sql`coalesce(sum(${cartItems.quantity}), 0)`.mapWith(Number) })
    .from(cartItems)
    .where(eq(cartItems.cartId, id));
  return row!.n;
}

export async function loadCart() {
  const id = cartId();
  if (!id) return [];
  return db
    .select({ id: products.id, slug: products.slug, name: products.name, priceCents: products.priceCents, quantity: cartItems.quantity })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(eq(cartItems.cartId, id))
    .orderBy(asc(products.id));
}

export async function addItem(form: FormData) {
  const product = productId(form);
  if (!product) return json({ added: false, error: "That product isn't available." }, { revalidate: [] });
  const id = cartId() ?? startCart();
  // One statement, so a cart a visitor's cookie outlived comes back with its first item. It stops at what's in stock.
  const added = await db.execute(sql`
    with cart as (insert into carts (id) values (${id}) on conflict do nothing)
    insert into cart_items (cart_id, product_id, quantity)
    select ${id}, p.id, 1 from products p where p.id = ${product} and p.stock > 0
    on conflict (cart_id, product_id) do update set quantity = cart_items.quantity + 1
    where cart_items.quantity < (select stock from products where id = ${product})
    returning quantity
  `);
  if (!added.length) return json({ added: false, error: "That's all we have in stock." }, { revalidate: ["cart-count", "product"] });
  return json({ added: true, error: undefined }, { revalidate });
}

export async function removeItem(form: FormData) {
  const id = cartId();
  const product = productId(form);
  if (id && product) await db.delete(cartItems).where(and(eq(cartItems.cartId, id), eq(cartItems.productId, product)));
  return reload({ revalidate });
}
