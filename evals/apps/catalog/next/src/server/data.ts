import 'server-only'
import { and, asc, count, eq, gte, lte, ne, type SQL, sql } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { connection } from 'next/server'
import { db } from '@/db'
import { categories, products } from '@/db/schema'

export const pageSize = 24

const card = {
  id: products.id,
  slug: products.slug,
  name: products.name,
  priceCents: products.priceCents,
  stock: products.stock,
}
export type ProductCard = {
  id: number
  slug: string
  name: string
  priceCents: number
  stock: number
}

// The category list barely changes and is in every prerendered shell. Everything a shopper reads about a product stays live.
export async function loadCategories() {
  'use cache'
  cacheTag('categories')
  cacheLife('hours')
  return db
    .select({ id: categories.id, slug: categories.slug, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.id))
}

// Whether a slug exists, and the name for the title, ahead of any Suspense boundary, so a miss can still answer 404.
export async function findCategory(slug: string) {
  return (await loadCategories()).find((c) => c.slug === slug)
}

export async function findProduct(slug: string) {
  'use cache'
  cacheTag('products')
  cacheLife('minutes')
  const [product] = await db
    .select({ name: products.name })
    .from(products)
    .where(eq(products.slug, slug))
  return product ?? null
}

export async function loadFeaturedSlugs() {
  'use cache'
  cacheTag('products')
  cacheLife('hours')
  return db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.featured, true))
    .orderBy(asc(products.id))
}

// connection(): live reads wait for a real request, so a link's prefetch doesn't run them.
export async function loadFeatured(): Promise<ProductCard[]> {
  await connection()
  return db
    .select(card)
    .from(products)
    .where(eq(products.featured, true))
    .orderBy(asc(products.id))
    .limit(12)
}

export type Filters = { min?: number; max?: number; stock: boolean; page: number }

export async function loadCategoryPage(id: number, { min, max, stock, page }: Filters) {
  await connection()
  const conditions: (SQL | undefined)[] = [
    eq(products.categoryId, id),
    min === undefined ? undefined : gte(products.priceCents, min * 100),
    max === undefined ? undefined : lte(products.priceCents, max * 100),
    stock ? sql`${products.stock} > 0` : undefined,
  ]
  const where = and(...conditions)
  const [[category], rows, [{ total }]] = await Promise.all([
    db.select({ name: categories.name }).from(categories).where(eq(categories.id, id)),
    db
      .select(card)
      .from(products)
      .where(where)
      .orderBy(asc(products.priceCents), asc(products.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(products).where(where),
  ])
  return { name: category?.name ?? null, rows, total }
}

export async function loadProduct(slug: string) {
  await connection()
  const [product] = await db
    .select({
      ...card,
      description: products.description,
      category: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(eq(products.slug, slug))
  return product ?? null
}

export async function loadRelated(slug: string): Promise<ProductCard[]> {
  await connection()
  const category = sql`(select ${products.categoryId} from ${products} where ${products.slug} = ${slug})`
  return db
    .select(card)
    .from(products)
    .where(and(eq(products.categoryId, category), ne(products.slug, slug)))
    .orderBy(asc(products.id))
    .limit(4)
}
