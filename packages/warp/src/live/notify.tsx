import { announce, notifyPolicy, type NotifyItem } from '@weft/ui-core'
import { toast } from '../Toast'

/**
 * The inbox's toast policy (07 §4.2) on warp's toaster: `const n = notify({ open: () => inboxOpen.value })`, then
 * `n.push({ title, description, tone, urgent, action })` per arrival. Inbox open: no toast, one announcement after a
 * second of quiet. Closed: a toast each, three at most; a burst collapses to "3 new notifications".
 */
export function notify(opts: { open: () => boolean; burst?: number; quiet?: number; max?: number; summary?: (n: number) => string }) {
  return notifyPolicy({
    ...opts,
    show: (t: NotifyItem) => toast.show(t),
    dismiss: id => toast.dismiss(id),
    announce: (text, assertive) => announce(document, text, assertive),
  })
}
