'use client'

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-center"
    >
      <h1 className="text-3xl font-semibold tracking-tight">Something broke on our bench</h1>
      <p className="text-muted">Your cart is safe. Give it a minute and try again.</p>
      <button
        type="button"
        onClick={reset}
        className="cursor-pointer font-medium text-accent-text hover:underline"
      >
        Try again
      </button>
    </div>
  )
}
