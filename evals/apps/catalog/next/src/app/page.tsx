import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { GridSkeleton, ProductCard, productGrid } from '@/components/product-card'
import { categoryArt } from '@/lib/art'
import { loadCategories, loadFeatured } from '@/server/data'

async function Featured() {
  const products = await loadFeatured()
  return <ul className={productGrid}>{products.map((p, i) => <ProductCard key={p.id} product={p} preload={i < 2} />)}</ul>
}

export default async function Home() {
  const categories = await loadCategories()
  return (
    <div className="flex flex-col gap-12">
      <section className="max-w-2xl py-4 sm:py-8">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Goods made to be used, and mended when they wear</h1>
        <p className="mt-4 text-lg text-muted">Five thousand dependable things for the home, from people who still answer the phone.</p>
      </section>
      <section aria-labelledby="categories">
        <h2 id="categories" className="mb-4 text-xl font-semibold tracking-tight">Shop by category</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.map(c => (
            <li key={c.id}>
              <Link href={`/c/${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-raised p-3 font-medium hover:border-accent">
                <Image src={categoryArt(c.slug)} alt="" width={48} height={48} className="size-12 rounded-xl bg-[#e8d9c3]" />
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="featured">
        <h2 id="featured" className="mb-4 text-xl font-semibold tracking-tight">Featured</h2>
        <Suspense fallback={<GridSkeleton count={12} />}>
          <Featured />
        </Suspense>
      </section>
    </div>
  )
}
