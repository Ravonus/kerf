import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing on this shelf</h1>
      <p className="text-muted">It may have sold out for good, or the address was mistyped.</p>
      <Link href="/" className="font-medium text-accent hover:underline">Back to the shop</Link>
    </div>
  )
}
