import { XIcon } from '@weft-js/warp-icons'
import { toaster, toastStore, type Toast, type ToastInput, type ToastPromise } from '@weft-js/warp-core'
import { onCleanup, state } from '@weft-js/core'
import { Icon, toneIcon } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the action and dismiss buttons' markup
import '@weft-js/warp-core/styles/components/spinner.css'
import '@weft-js/warp-core/styles/components/toast.css'

let store: ReturnType<typeof toastStore> | undefined
const toasts = () => (store ??= toastStore())

/**
 * Show a toast from anywhere (05 §5): `toast.show({ title, description, tone, action })`. Needs one <Toaster />.
 * Life is 5s + 60ms a word, 10s with an action; a critical toast with an action stays until dismissed.
 */
export const toast = {
  show: (t: ToastInput) => toasts().show(t),
  dismiss: (id: string) => toasts().dismiss(id),
  /** One toast through a promise's life: `pending`, then `done` or `error`, in place. Returns the promise. */
  promise: <T,>(p: Promise<T>, messages: ToastPromise<T>) => toasts().promise(p, messages),
}

/**
 * The toast region and the two pre-mounted live regions (05 §5; components.html:1115-1117). Mount once, near the
 * root. While a modal is open they move into it, or it would make them inert. Newest first; three stack, collapsed, and fan out on hover or focus (which pauses every timer); swipe or
 * Dismiss removes one; F8 focuses the newest.
 */
export function Toaster({ position }: { /** Which corner or edge. Bottom right by default. */ position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' } = {}) {
  const list = state<Toast[]>(toasts().get())
  onCleanup(toasts().subscribe(v => (list.value = v)))
  let region: HTMLElement | undefined
  use(toaster, () => region, () => toasts())
  return (
    <>
      <section ref={(n: any) => (region = n)} data-scope="toast" data-part="region" data-position={position === 'bottom-right' ? undefined : position} aria-label="Notifications (F8)" tabindex="-1">
        {list.value.map(t => (
          <div key={t.id} data-scope="toast" data-part="root" data-id={t.id} data-tone={t.tone ?? 'neutral'} data-state={t.state} role="group" aria-label={t.title}>
            {t.loading ? <span data-scope="spinner" data-part="icon" aria-hidden="true"></span> : <Icon name={toneIcon[t.tone ?? 'neutral']} data-part="icon" />}
            <div data-part="title">{t.title}</div>
            {t.description && <div data-part="description">{t.description}</div>}
            <div data-part="actions">
              {/* ghost <Button>s as their markup: they need no JS */}
              {t.action && <button type="button" data-scope="button" data-emphasis="ghost" data-size="sm" data-act="" onClick={() => { t.action!.onClick(); toast.dismiss(t.id) }}>{t.action.label}</button>}
              <button type="button" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" data-icon-only="" aria-label="Dismiss" data-x="" onClick={() => toast.dismiss(t.id)}><XIcon /></button>
            </div>
            {t.life > 0 && <span data-part="progress" aria-hidden="true"></span>}
          </div>
        ))}
      </section>
      <div data-scope="announcer" role="status" aria-live="polite" aria-atomic="true"></div>
      <div data-scope="announcer" role="alert" aria-live="assertive" aria-atomic="true"></div>
    </>
  )
}
