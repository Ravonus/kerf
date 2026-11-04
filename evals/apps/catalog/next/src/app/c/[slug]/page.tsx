import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { GridSkeleton, ProductCard, productGrid } from '@/components/product-card'
import { StockToggle } from '@/components/stock-toggle'
import {
  type Filters,
  findCategory,
  loadCategories,
  loadCategoryPage,
  pageSize,
} from '@/server/data'

type Params = Promise<{ slug: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

export async function generateStaticParams() {
  return (await loadCategories()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: (await findCategory((await params).slug))?.name }
}

const first = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw)

/** Whole dollars. Past this nothing is for sale, and cents still fit the column. */
function dollars(raw: string | string[] | undefined) {
  const text = first(raw)?.trim()
  const n = text ? Number(text) : NaN
  return n >= 0 ? Math.min(Math.floor(n), 1_000_000) : undefined
}

function parseFilters(search: Awaited<Search>): Filters {
  const page = Number(first(search.page))
  return {
    min: dollars(search.min),
    max: dollars(search.max),
    stock: search.stock !== undefined,
    page: Number.isSafeInteger(page) && page > 1 && page < 1e6 ? page : 1,
  }
}

function filterQuery({ min, max, stock }: Filters, page: number) {
  const query = new URLSearchParams()
  if (min !== undefined) query.set('min', String(min))
  if (max !== undefined) query.set('max', String(max))
  if (stock) query.set('stock', '1')
  if (page > 1) query.set('page', String(page))
  const text = query.toString()
  return text && `?${text}`
}

const input =
  'h-10 w-full min-w-0 rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none'
const blankLink = 'font-medium text-accent-text hover:underline'

function PriceFilters({ slug, filters }: { slug: string; filters: Filters }) {
  return (
    <Form
      key={filterQuery(filters, 1)}
      action={`/c/${slug}`}
      className="flex flex-col gap-2.5 self-start md:sticky md:top-20"
    >
      <div className="grid grid-cols-2 gap-1">
        <label className="text-sm font-medium">
          <span className="mb-1 block">Min price</span>
          <input
            type="number"
            name="min"
            min="0"
            inputMode="numeric"
            placeholder="$0"
            defaultValue={filters.min}
            className={input}
          />
        </label>
        <label className="text-sm font-medium">
          <span className="mb-1 block">Max price</span>
          <input
            type="number"
            name="max"
            min="0"
            inputMode="numeric"
            placeholder="Any"
            defaultValue={filters.max}
            className={input}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <StockToggle on={filters.stock} />
        In stock only
      </label>
      <button
        type="submit"
        className="h-10 w-full cursor-pointer rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-tint"
      >
        Apply
      </button>
    </Form>
  )
}

async function Listing({
  id,
  slug,
  searchParams,
}: {
  id: number
  slug: string
  searchParams: Search
}) {
  const filters = parseFilters(await searchParams)
  const { name, rows, total } = await loadCategoryPage(id, filters)
  if (name === null) notFound()
  const { page } = filters,
    pages = Math.max(1, Math.ceil(total / pageSize))
  const filtered = filters.min !== undefined || filters.max !== undefined || filters.stock
  return (
    <>
      <h1 className="-mt-4 text-3xl font-semibold tracking-tight">{name}</h1>
      <div className="order-2 grid gap-12 md:grid-cols-[16rem_minmax(0,1fr)]">
        <PriceFilters slug={slug} filters={filters} />
        <div className="flex flex-col gap-5">
          <p aria-live="polite" className="text-muted">
            {total.toLocaleString('en-US')} {total === 1 ? 'piece' : 'pieces'}, lowest price first
          </p>
          {rows.length ? (
            <ul className={productGrid}>
              {rows.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-1 py-12">
              <h2 className="text-xl font-semibold tracking-tight">
                {filtered ? 'Nothing fits those filters' : 'This aisle is empty for now'}
              </h2>
              <p className="text-muted">
                {filtered
                  ? "Widen the price range, or include what's sold out."
                  : "New pieces land here as soon as they're made."}
              </p>
              {filtered && (
                <Link href={`/c/${slug}`} className={blankLink}>
                  Clear the filters
                </Link>
              )}
            </div>
          )}
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-2.5">
              {page > 1 ? (
                <Link href={`/c/${slug}${filterQuery(filters, page - 1)}`} className={blankLink}>
                  Previous
                </Link>
              ) : (
                <span aria-disabled="true" className="text-muted">
                  Previous
                </span>
              )}
              <p className="text-muted">
                Page {page} of {pages}
              </p>
              {page < pages ? (
                <Link href={`/c/${slug}${filterQuery(filters, page + 1)}`} className={blankLink}>
                  Next
                </Link>
              ) : (
                <span aria-disabled="true" className="text-muted">
                  Next
                </span>
              )}
            </nav>
          )}
        </div>
      </div>
    </>
  )
}

function ListingSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="-mt-4 h-9 w-40 animate-pulse rounded bg-tint" />
      <div className="order-2 grid gap-12 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-tint" />
        <GridSkeleton count={pageSize} />
      </div>
    </>
  )
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: Search
}) {
  const { slug } = await params
  const [categories, category] = await Promise.all([loadCategories(), findCategory(slug)])
  if (!category) notFound()
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-5 px-8 pt-12 pb-8">
      <Link href="/" className="text-sm text-muted">
        All aisles
      </Link>
      <nav aria-label="Aisles" className="order-1 flex gap-1 overflow-x-auto">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.slug}`}
            aria-current={c.slug === slug ? 'page' : undefined}
            className="flex-none rounded-full border border-line px-2.5 py-1 aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
          >
            {c.name}
          </Link>
        ))}
      </nav>
      <Suspense fallback={<ListingSkeleton />}>
        <Listing id={category.id} slug={slug} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}
