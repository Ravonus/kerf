import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Not on the shelves' }

export default function NotFound() {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Not on the shelves</h1>
      <p className="text-muted">That piece may be gone, or the address mistyped.</p>
      <Link href="/" className="font-medium text-accent-text hover:underline">
        Back to the aisles
      </Link>
    </div>
  )
}
