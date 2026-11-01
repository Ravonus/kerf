"use server";

import { and, asc, count, eq, getTableColumns, gt, gte, lte, ne, sql } from "drizzle-orm";

import { db } from "~/db/index.server";
import { categories, products } from "~/db/schema";
import { pageSize, parseSearch, type ProductSearch } from "~/lib/search";

const card = { id: products.id, slug: products.slug, name: products.name, priceCents: products.priceCents, stock: products.stock };

export async function loadHome() {
  const [shelves, featured] = await Promise.all([
    db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(asc(categories.id)),
    db.select(card).from(products).where(eq(products.featured, true)).orderBy(asc(products.id)).limit(12),
  ]);
  return { categories: shelves, featured };
}

export async function loadCategory(slug: string, raw: ProductSearch) {
  const s = parseSearch(raw);
  const where = and(
    eq(categories.slug, slug),
    s.min !== undefined ? gte(products.priceCents, s.min * 100) : undefined,
    s.max !== undefined ? lte(products.priceCents, s.max * 100) : undefined,
    s.stock ? gt(products.stock, 0) : undefined,
  );
  const inCategory = eq(categories.id, products.categoryId);
  const [[category], shelves, rows, [total]] = await Promise.all([
    db.select({ name: categories.name }).from(categories).where(eq(categories.slug, slug)),
    db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(asc(categories.id)),
    db
      .select(card)
      .from(products)
      .innerJoin(categories, inCategory)
      .where(where)
      .orderBy(asc(products.priceCents), asc(products.id))
      .limit(pageSize)
      .offset((s.page - 1) * pageSize),
    db.select({ n: count() }).from(products).innerJoin(categories, inCategory).where(where),
  ]);
  return category ? { name: category.name, categories: shelves, rows, total: total!.n } : null;
}

export async function loadProduct(slug: string) {
  const sameShelf = sql`(select ${products.categoryId} from ${products} where ${products.slug} = ${slug})`;
  const [[product], related] = await Promise.all([
    db
      .select({ ...getTableColumns(products), category: { slug: categories.slug, name: categories.name } })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.slug, slug)),
    db
      .select(card)
      .from(products)
      .where(and(eq(products.categoryId, sameShelf), ne(products.slug, slug)))
      .orderBy(asc(products.id))
      .limit(4),
  ]);
  return product ? { ...product, related } : null;
}
