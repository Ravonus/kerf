const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' })
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function RevenueChart({ months }: { months: { month: string; cents: number }[] }) {
  const top = Math.max(...months.map(m => m.cents), 1)
  const bars = months.map(m => ({ ...m, label: monthName.format(new Date(`${m.month}-01T00:00:00Z`)), amount: usd.format(m.cents / 100) }))
  return (
    <div role="img" aria-label={`Revenue by month. ${bars.map(b => `${b.label}: ${b.amount}`).join(', ')}.`} className="flex h-56 items-end gap-1.5 sm:gap-3">
      {bars.map(bar => (
        <div key={bar.month} title={`${bar.label}: ${bar.amount}`} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2">
          <div className="flex min-h-0 flex-1 flex-col justify-end">
            <span className="mb-1 hidden text-center text-xs font-medium tabular-nums group-hover:block">{bar.amount}</span>
            <div className="rounded-t-md bg-accent/80 transition-colors group-hover:bg-accent" style={{ height: `${Math.max((bar.cents / top) * 100, 1)}%` }} />
          </div>
          <span className="text-center text-xs text-muted">{bar.label}</span>
        </div>
      ))}
    </div>
  )
}
