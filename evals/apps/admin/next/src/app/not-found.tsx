import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing on this shelf</h1>
      <p className="text-muted">The order may be gone, or the address mistyped.</p>
      <Link href="/admin" className="font-medium text-accent hover:underline">
        Back to the overview
      </Link>
    </main>
  )
}
