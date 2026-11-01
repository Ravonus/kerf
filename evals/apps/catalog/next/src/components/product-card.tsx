import Image from 'next/image'
import Link from 'next/link'
import { productArt } from '@/lib/art'
import { money } from '@/lib/format'
import type { ProductCard as Product } from '@/server/data'

export const productGrid = 'grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4'
export const productSizes = '(min-width: 1152px) 264px, (min-width: 1024px) 23vw, (min-width: 768px) 31vw, 46vw'

export function ProductCard({ product, preload = false }: { product: Product; preload?: boolean }) {
  const { image, tile } = productArt(product.id)
  return (
    <li>
      <Link href={`/p/${product.slug}`} className="group block">
        <span className={`block overflow-hidden rounded-2xl ${tile}`}>
          <Image src={image} alt="" sizes={productSizes} preload={preload} className="aspect-square w-full object-contain transition-transform duration-300 group-hover:scale-105" />
        </span>
        <span className="mt-3 block font-medium group-hover:text-accent">{product.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-sm text-muted tabular-nums">
          {money(product.priceCents)}
          {product.stock === 0 && <span className="rounded bg-tint px-1.5 py-0.5 text-xs">Sold out</span>}
        </span>
      </Link>
    </li>
  )
}

export function GridSkeleton({ count }: { count: number }) {
  return (
    <ul aria-hidden="true" className={`${productGrid} animate-pulse`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>
          <div className="aspect-square rounded-2xl bg-tint" />
          <div className="mt-3 h-6 w-3/4 rounded bg-tint" />
          <div className="mt-0.5 h-6 w-1/4 rounded bg-tint" />
        </li>
      ))}
    </ul>
  )
}
