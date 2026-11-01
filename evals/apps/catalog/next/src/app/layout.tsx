import type { Metadata } from 'next'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { CartLink } from '@/components/cart-link'
import { CartProvider } from '@/components/cart-provider'
import { Logo } from '@/components/logo'
import { loadCartCount } from '@/server/cart-data'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Mendwell', template: '%s · Mendwell' },
  description: 'Mendwell sells everyday goods made to be used hard and repaired when they wear.',
}

async function CartCount() {
  return <CartLink count={await loadCartCount()} />
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <CartProvider>
          <header className="sticky top-0 z-10 border-b border-line bg-paper">
            <div className="mx-auto flex max-w-360 items-center justify-between gap-5 px-8 py-2.5">
              <Link href="/"><Logo /></Link>
              <Suspense fallback={<CartLink />}>
                <CartCount />
              </Suspense>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </CartProvider>
        <footer className="mt-8 border-t border-line">
          <div className="mx-auto flex max-w-360 flex-wrap justify-between gap-2.5 px-8 py-5 text-muted">
            <p>Mendwell. Goods made to be used hard and fixed when they wear.</p>
            <p>Free repairs for the first ten years.</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
