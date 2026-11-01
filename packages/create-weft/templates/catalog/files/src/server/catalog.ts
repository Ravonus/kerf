import { query } from '@weft/start'
import { and, asc, count, eq, gt, gte, lte, ne } from 'drizzle-orm'
import { z } from 'zod'
import { categories, products } from '#/db/schema'
import { PAGE_SIZE } from '#/lib/catalog'

const card = { slug: products.slug, name: products.name, priceCents: products.priceCents, stock: products.stock }

export type ProductCardRow = { slug: string; name: string; priceCents: number; stock: number }

export const listCategories = query({
  tags: ['categories'],
  run: ({ ctx }) => ctx.db.select({ slug: categories.slug, name: categories.name }).from(categories).orderBy(asc(categories.id)),
})

export const getCategory = query({
  input: z.object({ slug: z.string().max(200) }),
  tags: ['categories'],
  run: async ({ input, ctx }) => {
    const [category] = await ctx.db.select().from(categories).where(eq(categories.slug, input.slug))
    return category ?? null
  },
})

export const featuredProducts = query({
  tags: ['products'],
  run: ({ ctx }) => ctx.db.select(card).from(products).where(eq(products.featured, true)).orderBy(asc(products.id)).limit(12),
})

export const listProducts = query({
  input: z.object({
    categoryId: z.number().int().positive(),
    min: z.number().int().min(0).nullable(),
    max: z.number().int().min(0).nullable(),
    stock: z.boolean(),
    page: z.number().int().min(1),
  }),
  tags: ['products'],
  run: async ({ input, ctx }) => {
    const where = and(
      eq(products.categoryId, input.categoryId),
      input.min !== null ? gte(products.priceCents, input.min * 100) : undefined,
      input.max !== null ? lte(products.priceCents, input.max * 100) : undefined,
      input.stock ? gt(products.stock, 0) : undefined,
    )
    const [rows, [found]] = await Promise.all([
      ctx.db.select(card).from(products).where(where)
        .orderBy(asc(products.priceCents), asc(products.id))
        .limit(PAGE_SIZE)
        .offset((input.page - 1) * PAGE_SIZE),
      ctx.db.select({ total: count() }).from(products).where(where),
    ])
    return { rows, total: found!.total }
  },
})

export const getProduct = query({
  input: z.object({ slug: z.string().max(200) }),
  tags: ['products', 'categories'],
  run: async ({ input, ctx }) => {
    const [product] = await ctx.db.select({ ...card, id: products.id, description: products.description, categoryId: products.categoryId, categorySlug: categories.slug, categoryName: categories.name })
      .from(products)
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(eq(products.slug, input.slug))
    return product ?? null
  },
})

export const relatedProducts = query({
  input: z.object({ id: z.number().int().positive(), categoryId: z.number().int().positive() }),
  tags: ['products'],
  run: ({ input, ctx }) =>
    ctx.db.select(card).from(products)
      .where(and(eq(products.categoryId, input.categoryId), ne(products.id, input.id)))
      .orderBy(asc(products.id))
      .limit(4),
})
