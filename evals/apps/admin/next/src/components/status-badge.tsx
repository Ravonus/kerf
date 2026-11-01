const tones: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  paid: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  shipped: 'bg-accent/15 text-accent-strong',
  refunded: 'bg-danger/10 text-danger',
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${tones[status] ?? 'bg-tint text-muted'}`}>{status}</span>
}
