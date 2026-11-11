// What the agent pack's components share: glyphs from the app specimen, the sweep's two parts, an icon button, a value
// held in a State or a plain prop, and the thin progress bar.
import { type IconComponent } from '@kerf/veneer-icons'
import { installSweep } from '@kerf/veneer-core'
import { Box } from '@kerf/core/internal'
import { onMount, state, untrack, type State } from '@kerf/core'
import { Button } from '../Button'
import '@kerf/veneer-core/styles/app/tokens.css'
import '@kerf/veneer-core/styles/app/base.css'
import '@kerf/veneer-core/styles/components/progress.css'

/** The two sweep parts a [data-sweep] host carries. */
export const Sweep = () => (
  <>
    <span data-part="sweep-base" aria-hidden="true"></span>
    <span data-part="sweep" aria-hidden="true"></span>
  </>
)

/** Follow the sweep machine; for hosts this pack draws by hand. */
export const useSweep = () =>
  onMount(() => {
    installSweep()
  })

/** A small ghost icon button, named by `label`. */
export function IconButton({
  icon,
  label,
  ...rest
}: {
  icon: IconComponent
  label: string
  [attr: string]: unknown
}) {
  return (
    <Button emphasis="ghost" tone="neutral" size="sm" label={label} data-icon-only="" {...rest}>
      {icon({})}
    </Button>
  )
}

/** A thin determinate bar; `value` is 0 to 1. */
export function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div
      data-scope="progress"
      data-part="root"
      role="progressbar"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(value * 100)}
      style={`--_v:${value}`}
    >
      <div data-part="track">
        <div data-part="range"></div>
      </div>
    </div>
  )
}

/** One read and write over a State to bind or a plain value with its change callback. */
export function held<T>(
  value: () => State<T> | T | undefined,
  fallback: T,
  onChange?: () => ((v: T) => void) | undefined,
) {
  const box = (v: unknown): v is State<T> => v instanceof Box
  const own = state<T>(
    untrack(() => {
      const v = value()
      return box(v) || v === undefined ? fallback : v
    }),
  )
  return {
    get value(): T {
      const v = value()
      return box(v) ? v.value : v !== undefined ? v : own.value
    },
    set(next: T) {
      const v = untrack(value)
      if (box(v)) v.value = next
      else own.value = next
      untrack(onChange ?? (() => undefined))?.(next)
    },
  }
}
