import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

const figtree = localFont({
  src: '../assets/figtree-latin-wght.woff2',
  weight: '300 900',
  variable: '--font-figtree',
})

export const metadata: Metadata = {
  title: { default: 'Emberline: hear what customers keep asking for', template: '%s · Emberline' },
  description: 'Emberline listens to your customer calls and turns them into a ranked list of what to build next.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
