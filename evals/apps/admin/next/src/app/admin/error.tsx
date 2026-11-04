'use client'

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">This page didn't load</h1>
      <p className="text-muted">Nothing was lost. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer font-medium text-accent hover:underline"
      >
        Try again
      </button>
    </div>
  )
}
