'use client'

export default function TodosError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your list didn't load</h1>
      <p className="text-muted">Nothing was lost. Please try again.</p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer font-medium text-accent hover:underline"
      >
        Try again
      </button>
    </main>
  )
}
