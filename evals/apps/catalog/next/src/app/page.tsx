import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { GridSkeleton, ProductArt, ProductCard, wideGrid } from '@/components/product-card'
import { loadCategories, loadFeatured } from '@/server/data'

// `absolute`: a layout's title template skips a page in its own segment.
export const metadata: Metadata = { title: { absolute: 'Goods made to be mended · Mendwell' } }

const promises = [
  ['Screws, not glue', 'Every piece comes apart with a screwdriver you already own.'],
  ['Parts on the shelf', 'Handles, hinges and cords are stocked for as long as we sell the piece.'],
  ['Repairs by post', 'Send it in, and it comes back working. Free for ten years.'],
]

async function Featured() {
  const products = await loadFeatured()
  return <ul className={wideGrid}>{products.map(p => <ProductCard key={p.id} product={p} />)}</ul>
}

export default async function Home() {
  const categories = await loadCategories()
  return (
    <div className="mx-auto max-w-360 px-8">
      <section className="grid items-center gap-12 py-8 md:grid-cols-[3fr_2fr]">
        <div className="flex flex-col items-start gap-2.5">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Buy it once. Mend it forever.</h1>
          <p className="max-w-xl text-xl">Everyday goods in oak, copper, linen and slate, built with screws instead of glue, and repaired free for ten years.</p>
          <a href="#featured" className="rounded-full bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong">See this month's table</a>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <ProductArt name="Copper Kettle" className="col-span-2 aspect-2/1!" />
          <ProductArt name="Oak Stool" />
          <ProductArt name="Slate Lamp" />
        </div>
      </section>
      <div className="flex flex-col gap-8">
        <section aria-labelledby="aisles-title" className="flex flex-col gap-2.5">
          <h2 id="aisles-title" className="text-xl font-semibold tracking-tight">Aisles</h2>
          <nav aria-label="Aisles" className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] border-t-2 border-ink">
            {categories.map(c => <Link key={c.id} href={`/c/${c.slug}`} className="border-b border-line py-2.5 text-xl font-semibold hover:text-accent-text">{c.name}</Link>)}
          </nav>
        </section>
        <section id="featured" aria-labelledby="featured-title" className="flex flex-col gap-2.5">
          <h2 id="featured-title" className="text-xl font-semibold tracking-tight">On the front table</h2>
          <Suspense fallback={<GridSkeleton count={12} wide />}>
            <Featured />
          </Suspense>
        </section>
        <div className="grid gap-5 border-t-2 border-ink pt-12 md:grid-cols-3">
          {promises.map(([title, text]) => (
            <div key={title} className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
              <p className="text-muted">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
