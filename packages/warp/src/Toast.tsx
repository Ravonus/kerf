import { XIcon } from '@weft-js/warp-icons'
import {
  toaster,
  toastStore,
  type Toast,
  type ToastInput,
  type ToastPromise,
} from '@weft-js/warp-core'
import { onCleanup, state, untrack, watch } from '@weft-js/core'
import { Icon, toneIcon } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/button.css' // the action and dismiss buttons' markup
import '@weft-js/warp-core/styles/components/spinner.css'
import '@weft-js/warp-core/styles/components/toast.css'

let store: ReturnType<typeof toastStore> | undefined
const toasts = () => (store ??= toastStore())

// The Toasters mounted, oldest first. They share one list, so only the newest shows it: a page that mounts more
// than one (a layout's and a demo's) still shows each toast once. One whose corner changes is the one in use, and
// comes to the front.
const mounted = state<object[]>([])
const toFront = (list: object[], me: object) => [...list.filter((k) => k !== me), me]

/** Joins the mounted list as it renders, comes to the front when `position` changes, and says if it is in front.
 * On the server nothing mounts for long, so every Toaster renders the list as it stands. */
function inFront(position: () => unknown) {
  const me = {}
  const front = () => {
    const m = untrack(() => mounted.value)
    if (m.at(-1) !== me) mounted.value = toFront(m, me)
  }
  if (typeof document !== 'undefined') front()
  watch(position, front)
  onCleanup(() => (mounted.value = mounted.value.filter((k) => k !== me)))
  return () => !mounted.value.length || mounted.value.at(-1) === me
}

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

type ToasterProps = {
  /** Which corner or edge. Bottom right by default. */ position?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
}

/**
 * The toast region and the two pre-mounted live regions (05 §5; components.html:1115-1117). Mount once, near the
 * root. While a modal is open they move into it, or it would make them inert. Newest first; three stack, collapsed, and fan out on hover or focus (which pauses every timer); swipe or
 * Dismiss removes one; F8 focuses the newest.
 */
export function Toaster(props: ToasterProps = {}) {
  const list = state<Toast[]>(toasts().get())
  onCleanup(toasts().subscribe((v) => (list.value = v)))
  const mine = inFront(() => props.position)
  let region: HTMLElement | undefined
  use(
    toaster,
    () => region,
    () => toasts(),
  )
  return (
    <>
      <section
        ref={(n) => (region = n)}
        data-scope="toast"
        data-part="region"
        data-position={props.position === 'bottom-right' ? undefined : props.position}
        aria-label="Notifications (F8)"
        tabindex="-1"
      >
        {(mine() ? list.value : []).map((t) => (
          <div
            key={t.id}
            data-scope="toast"
            data-part="root"
            data-id={t.id}
            data-tone={t.tone ?? 'neutral'}
            data-state={t.state}
            role="group"
            aria-label={t.title}
          >
            {t.loading ? (
              <span data-scope="spinner" data-part="icon" aria-hidden="true"></span>
            ) : (
              <Icon name={toneIcon[t.tone ?? 'neutral']} data-part="icon" />
            )}
            <div data-part="title">{t.title}</div>
            {t.description && <div data-part="description">{t.description}</div>}
            <div data-part="actions">
              {/* ghost <Button>s as their markup: they need no JS */}
              {t.action && (
                <button
                  type="button"
                  data-scope="button"
                  data-emphasis="ghost"
                  data-size="sm"
                  data-act=""
                  onClick={() => {
                    t.action!.onClick()
                    toast.dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                data-scope="button"
                data-emphasis="ghost"
                data-tone="neutral"
                data-size="sm"
                data-icon-only=""
                aria-label="Dismiss"
                data-x=""
                onClick={() => toast.dismiss(t.id)}
              >
                <XIcon />
              </button>
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
