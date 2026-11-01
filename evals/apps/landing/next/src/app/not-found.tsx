import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <section className="mx-auto max-w-2xl px-4 pt-14 text-center sm:px-6 lg:pt-20">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">We can't find that page</h1>
      <p className="mt-4 text-lg text-muted">The link may be old, or the address mistyped.</p>
      <Link href="/" className="mt-8 inline-block rounded-xl bg-accent px-5 py-3 font-semibold text-on-accent transition-colors hover:bg-accent-strong">Back to the home page</Link>
    </section>
  )
}
