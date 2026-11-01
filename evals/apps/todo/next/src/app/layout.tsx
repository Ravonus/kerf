import type { Metadata } from 'next'
import localFont from 'next/font/local'
import type { ReactNode } from 'react'
import './globals.css'

const figtree = localFont({
  src: '../assets/figtree-latin-wght.woff2',
  weight: '300 900',
  variable: '--font-figtree',
})

export const metadata: Metadata = {
  title: { default: 'Emberline', template: '%s · Emberline' },
  description: 'A short list of what to do next.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  )
}
