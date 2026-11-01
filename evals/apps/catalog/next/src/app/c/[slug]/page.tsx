import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { GridSkeleton, ProductCard, productGrid } from '@/components/product-card'
import { type Filters, findCategory, loadCategories, loadCategoryPage, pageSize } from '@/server/data'

type Params = Promise<{ slug: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

export async function generateStaticParams() {
  return (await loadCategories()).map(({ slug }) => ({ slug }))
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: (await findCategory((await params).slug))?.name }
}

function whole(raw: string | string[] | undefined) {
  if (typeof raw !== 'string' || !/^\d{1,9}$/.test(raw)) return undefined
  return Number(raw)
}

function parseFilters(search: Awaited<Search>): Filters {
  return { min: whole(search.min), max: whole(search.max), stock: search.stock === '1', page: Math.max(whole(search.page) ?? 1, 1) }
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

const input = 'h-10 w-24 rounded-lg border border-line bg-raised px-3 text-ink tabular-nums focus:border-accent focus:outline-none'
const pager = 'rounded-lg border border-line bg-raised px-4 py-2 text-sm font-medium hover:border-accent'

async function Listing({ id, slug, searchParams }: { id: number; slug: string; searchParams: Search }) {
  const filters = parseFilters(await searchParams)
  const { name, rows, total } = await loadCategoryPage(id, filters)
  if (name === null) notFound()
  const { page } = filters, pages = Math.ceil(total / pageSize)
  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-muted tabular-nums">{total.toLocaleString('en-US')} {total === 1 ? 'product' : 'products'}</p>
      </div>
      <Form key={filterQuery(filters, 1)} action={`/c/${slug}`} aria-label="Filter products" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Min price ($)
          <input name="min" inputMode="numeric" pattern="\d*" defaultValue={filters.min} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Max price ($)
          <input name="max" inputMode="numeric" pattern="\d*" defaultValue={filters.max} className={input} />
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="stock" value="1" defaultChecked={filters.stock} className="size-4 accent-[var(--accent)]" />
          In stock
        </label>
        <button type="submit" className="h-10 rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong">Apply</button>
      </Form>
      {rows.length
        ? <ul className={productGrid}>{rows.map((p, i) => <ProductCard key={p.id} product={p} preload={i < 2} />)}</ul>
        : <p className="py-16 text-center text-muted">Nothing here fits those filters.</p>}
      {(page > 1 || page < pages) && (
        <nav aria-label="Pages" className="flex items-center justify-between">
          {page > 1 ? <Link href={`/c/${slug}${filterQuery(filters, page - 1)}`} className={pager}>Previous</Link> : <span />}
          <span className="text-sm text-muted tabular-nums">Page {page} of {Math.max(pages, page)}</span>
          {page < pages ? <Link href={`/c/${slug}${filterQuery(filters, page + 1)}`} className={pager}>Next</Link> : <span />}
        </nav>
      )}
    </>
  )
}

function ListingSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="animate-pulse">
        <div className="h-9 w-40 rounded bg-tint" />
        <div className="mt-1 h-5 w-24 rounded bg-tint" />
      </div>
      <div aria-hidden="true" className="h-[3.875rem] animate-pulse rounded-lg bg-tint" />
      <GridSkeleton count={pageSize} />
    </>
  )
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params
  const [categories, category] = await Promise.all([loadCategories(), findCategory(slug)])
  if (!category) notFound()
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {categories.map(c => (
          <Link key={c.id} href={`/c/${c.slug}`} aria-current={c.slug === slug ? 'page' : undefined} className="shrink-0 rounded-full border border-line bg-raised px-3 py-1 text-sm hover:border-accent aria-[current=page]:border-accent aria-[current=page]:text-accent">
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
