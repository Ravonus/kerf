'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">The shop hit a snag</h1>
      <p className="text-muted">That didn't load. Your cart is safe.</p>
      <button type="button" onClick={reset} className="font-medium text-accent hover:underline">Try again</button>
    </div>
  )
}
