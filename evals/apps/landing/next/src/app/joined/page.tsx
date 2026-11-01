import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: "You're on the list", robots: { index: false } }

export default function Joined() {
  return (
    <section className="mx-auto max-w-2xl px-4 pt-14 text-center sm:px-6 lg:pt-20">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">You're on the list</h1>
      <p className="mt-4 text-lg text-muted">We'll write when your place in line comes up. Everyone hears from us in the order they joined.</p>
      <Link href="/pricing" className="mt-8 inline-block rounded-xl border border-line px-5 py-3 font-semibold transition-colors hover:border-ink">See pricing</Link>
    </section>
  )
}
