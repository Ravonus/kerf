import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AddToCart } from '@/components/add-to-cart'
import { GridSkeleton, ProductCard, productGrid } from '@/components/product-card'
import { productArt } from '@/lib/art'
import { money } from '@/lib/format'
import { findProduct, loadFeaturedSlugs, loadProduct, loadRelated } from '@/server/data'

type Params = Promise<{ slug: string }>

export function generateStaticParams() {
  return loadFeaturedSlugs()
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return { title: (await findProduct((await params).slug))?.name }
}

function availability(stock: number) {
  if (stock === 0) return 'Sold out'
  return stock < 5 ? `Only ${stock} left` : 'In stock'
}

async function Details({ slug }: { slug: string }) {
  const product = await loadProduct(slug)
  if (!product) notFound()
  const { image, tile } = productArt(product.id)
  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className={`overflow-hidden rounded-3xl ${tile}`}>
        <Image src={image} alt={product.name} sizes="(min-width: 1152px) 548px, (min-width: 768px) 47vw, 92vw" preload className="aspect-square w-full object-contain" />
      </div>
      <div className="flex flex-col items-start gap-4 md:py-6">
        <Link href={`/c/${product.categorySlug}`} className="text-sm font-medium text-accent hover:underline">{product.category}</Link>
        <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
        <p className="text-2xl tabular-nums">{money(product.priceCents)}</p>
        <p className="max-w-prose text-muted">{product.description}</p>
        <p className="text-sm font-medium">{availability(product.stock)}</p>
        {product.stock > 0 && <AddToCart productId={product.id} />}
      </div>
    </div>
  )
}

async function Related({ slug }: { slug: string }) {
  const products = await loadRelated(slug)
  return <ul className={productGrid}>{products.map(p => <ProductCard key={p.id} product={p} />)}</ul>
}

function DetailsSkeleton() {
  return (
    <div aria-hidden="true" className="grid animate-pulse gap-8 md:grid-cols-2">
      <div className="aspect-square rounded-3xl bg-tint" />
      <div className="flex flex-col gap-4 md:py-6">
        <div className="h-5 w-20 rounded bg-tint" />
        <div className="h-9 w-3/4 rounded bg-tint" />
        <div className="h-8 w-24 rounded bg-tint" />
        <div className="h-20 rounded bg-tint" />
      </div>
    </div>
  )
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = await params
  if (!await findProduct(slug)) notFound()
  return (
    <div className="flex flex-col gap-12">
      <Suspense fallback={<DetailsSkeleton />}>
        <Details slug={slug} />
      </Suspense>
      <section aria-labelledby="related">
        <h2 id="related" className="mb-4 text-xl font-semibold tracking-tight">You might also like</h2>
        <Suspense fallback={<GridSkeleton count={4} />}>
          <Related slug={slug} />
        </Suspense>
      </section>
    </div>
  )
}
