import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AddToCart } from '@/components/add-to-cart'
import { GridSkeleton, ProductArt, ProductCard, SoldOut, wideGrid } from '@/components/product-card'
import { money } from '@/lib/format'
import { findProduct, loadFeaturedSlugs, loadProduct, loadRelated } from '@/server/data'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return loadFeaturedSlugs()
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: (await findProduct((await params).slug))?.name }
}

const stockLine = (stock: number) => stock === 0 ? 'Back when the workshop catches up.' : stock < 5 ? `Only ${stock} left.` : 'In stock, ships in two days.'

async function Details({ slug }: { slug: string }) {
  const product = await loadProduct(slug)
  if (!product) notFound()
  return (
    <article className="grid items-start gap-12 md:grid-cols-2">
      <ProductArt name={product.name} />
      <div className="flex flex-col gap-2.5">
        <Link href={`/c/${product.categorySlug}`} className="text-sm text-muted">{product.category}</Link>
        <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
        <p className="flex items-center gap-2.5">
          <span className="text-3xl font-semibold tabular-nums">{money(product.priceCents)}</span>
          {product.stock === 0 && <SoldOut />}
        </p>
        <p>{product.description}</p>
        <p className="text-muted">{stockLine(product.stock)}</p>
        <AddToCart productId={product.id} soldOut={product.stock === 0} />
      </div>
    </article>
  )
}

async function Related({ slug }: { slug: string }) {
  const products = await loadRelated(slug)
  if (!products.length) return <p className="text-muted">This is the only piece in its aisle for now.</p>
  return <ul className={wideGrid}>{products.map(p => <ProductCard key={p.id} product={p} />)}</ul>
}

function DetailsSkeleton() {
  return (
    <div aria-hidden="true" className="grid animate-pulse items-start gap-12 md:grid-cols-2">
      <div className="aspect-square rounded-[20px] bg-tint" />
      <div className="flex flex-col gap-2.5">
        <div className="h-5 w-20 rounded bg-tint" />
        <div className="h-9 w-3/4 rounded bg-tint" />
        <div className="h-9 w-24 rounded bg-tint" />
        <div className="h-20 rounded bg-tint" />
      </div>
    </div>
  )
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params
  if (!await findProduct(slug)) notFound()
  return (
    <div className="mx-auto flex max-w-360 flex-col gap-8 px-8 pt-12 pb-8">
      <Suspense fallback={<DetailsSkeleton />}>
        <Details slug={slug} />
      </Suspense>
      <section aria-labelledby="related-title" className="flex flex-col gap-2.5">
        <h2 id="related-title" className="text-xl font-semibold tracking-tight">From the same aisle</h2>
        <Suspense fallback={<GridSkeleton count={4} wide />}>
          <Related slug={slug} />
        </Suspense>
      </section>
    </div>
  )
}
