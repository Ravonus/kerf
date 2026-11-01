import Link from 'next/link'
import { artOf } from '@/lib/art'
import { money } from '@/lib/format'
import type { ProductCard as Product } from '@/server/data'

export const productGrid = 'grid grid-cols-2 gap-5 sm:grid-cols-3'
export const wideGrid = 'grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4'

export function ProductArt({ name, className = '' }: { name: string; className?: string }) {
  const { material, path } = artOf(name)
  return (
    <span className={`art ${className}`} data-material={material}>
      <svg viewBox="0 0 120 120" aria-hidden="true"><path fillRule="evenodd" d={path} /></svg>
    </span>
  )
}

export const SoldOut = () => <span className="rounded-full bg-tint px-2 py-0.5 text-xs font-medium text-muted">Sold out</span>

export function ProductCard({ product }: { product: Product }) {
  return (
    <li>
      <Link href={`/p/${product.slug}`} className="group flex flex-col gap-1">
        <ProductArt name={product.name} />
        <span className="group-hover:text-accent-text">{product.name}</span>
        <span className="flex items-center gap-1">
          <span className="font-semibold tabular-nums">{money(product.priceCents)}</span>
          {product.stock === 0 && <SoldOut />}
        </span>
      </Link>
    </li>
  )
}

export function GridSkeleton({ count, wide = false }: { count: number; wide?: boolean }) {
  return (
    <ul aria-hidden="true" className={`${wide ? wideGrid : productGrid} animate-pulse`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-square rounded-[20px] bg-tint" />
          <div className="mt-1 h-6 w-3/4 rounded bg-tint" />
          <div className="mt-1 h-6 w-1/4 rounded bg-tint" />
        </li>
      ))}
    </ul>
  )
}
