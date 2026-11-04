'use client'

import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="flex items-center gap-3">
      <p role="status" className="text-sm text-muted tabular-nums">
        Count: {count}
      </p>
      <button
        type="button"
        onClick={() => setCount((n) => n + 1)}
        className="h-9 cursor-pointer rounded-lg bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        Count
      </button>
    </div>
  )
}
