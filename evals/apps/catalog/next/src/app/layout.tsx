import type { Metadata } from 'next'
import localFont from 'next/font/local'
import Link from 'next/link'
import { type ReactNode, Suspense } from 'react'
import { CartLink } from '@/components/cart-link'
import { CartProvider } from '@/components/cart-provider'
import { Logo } from '@/components/logo'
import { loadCartCount } from '@/server/cart-data'
import './globals.css'

const figtree = localFont({
  src: '../assets/figtree-latin-wght.woff2',
  weight: '300 900',
  variable: '--font-figtree',
})

export const metadata: Metadata = {
  title: { default: 'Housewright: goods made to be used', template: '%s · Housewright' },
  description: 'Housewright sells dependable things for the home, made to be used every day and repaired when they wear.',
}

async function CartCount() {
  return <CartLink count={await loadCartCount()} />
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <CartProvider>
          <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/90 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
              <Link href="/"><Logo /></Link>
              <Suspense fallback={<CartLink />}>
                <CartCount />
              </Suspense>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">{children}</main>
        </CartProvider>
        <footer className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">Housewright. Repairs for life on everything we sell.</p>
        </footer>
      </body>
    </html>
  )
}
