import type { ReactNode } from 'react'

export function PageTitle({ children, note }: { children: ReactNode; note: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{children}</h1>
      <p className="mt-1 text-sm text-muted">{note}</p>
    </div>
  )
}
