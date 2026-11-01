import type { Metadata } from 'next'
import { Suspense } from 'react'
import { panel, Skeleton } from '@/components/skeleton'
import { currentUser } from '@/server/auth'
import { loadTopCities, loadTopProducts } from '@/server/data'

export const metadata: Metadata = { title: 'Insights' }

const item = 'flex justify-between gap-4 border-b border-line py-2 text-sm last:border-0'

async function CitiesSection() {
  await currentUser()
  const cities = await loadTopCities()
  return (
    <section aria-labelledby="cities" className={`${panel} p-5`}>
      <h2 id="cities" className="mb-2 font-semibold">Top cities</h2>
      <ul>{cities.map(c => <li key={c.city} className={item}>{c.city}<span className="text-muted tabular-nums">{c.orders.toLocaleString('en-US')}</span></li>)}</ul>
    </section>
  )
}

async function Products() {
  await currentUser()
  const products = await loadTopProducts()
  return (
    <section aria-labelledby="products" className={`${panel} p-5`}>
      <h2 id="products" className="mb-2 font-semibold">Top products</h2>
      <ul>{products.map(p => <li key={p.id} className={item}>{p.name}<span className="text-muted tabular-nums">{p.units.toLocaleString('en-US')}</span></li>)}</ul>
    </section>
  )
}

export default function Nested() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Suspense fallback={<Skeleton className="h-80" />}><CitiesSection /></Suspense>
      <Suspense fallback={<Skeleton className="h-80" />}><Products /></Suspense>
    </div>
  )
}
