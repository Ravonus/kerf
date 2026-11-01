export const panel = 'rounded-2xl border border-line bg-raised'

export function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse ${panel} ${className}`} />
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true" className={`animate-pulse overflow-hidden ${panel}`}>
      <div className="h-10 border-b border-line bg-tint" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-6 border-b border-line px-4 last:border-0">
          <div className="h-3 w-12 rounded bg-tint" />
          <div className="h-3 w-40 rounded bg-tint" />
          <div className="ml-auto h-3 w-20 rounded bg-tint" />
        </div>
      ))}
    </div>
  )
}
