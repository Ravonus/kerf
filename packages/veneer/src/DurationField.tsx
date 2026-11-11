import { TimerIcon } from '@kerf-js/veneer-icons'
import {
  balance,
  formatDuration,
  pad,
  parseDuration,
  totalSeconds,
  type DurationParts,
  type IsoDuration,
} from '@kerf-js/veneer-core'
import { derived, state, untrack, type State } from '@kerf-js/core'
import {
  bindable,
  Composite,
  Hidden,
  usePickerEnv,
  type Bindable,
  type RichFieldProps,
} from './Picker'

type Unit = 'd' | 'h' | 'm' | 's'
const INTL = { d: 'day', h: 'hour', m: 'minute', s: 'second' } as const
const NAMES = { d: 'Days', h: 'Hours', m: 'Minutes', s: 'Seconds' } as const
const SHORT = { d: 'd', h: 'h', m: 'min', s: 's' } as const
const SIZE = { d: 86400, h: 3600, m: 60, s: 1 } as const
const MAX = { d: 99, h: 99, m: 59, s: 59 } as const

/** Props for DurationField. */
export type DurationFieldProps = RichFieldProps &
  Bindable<IsoDuration | null> & {
    units?: Unit[]
    max?: IsoDuration | undefined
    step?: Partial<Record<'h' | 'm' | 's', number>>
    balance?: boolean
  }

type DurationKeyContext = {
  units: () => Unit[]
  step: () => DurationFieldProps['step']
  carry: () => boolean
  group: () => HTMLDivElement | undefined
  parts: { readonly value: DurationParts }
  buf: State<string>
  write: (next: DurationParts) => void
}

function durationKeys({ units, step, carry, group, parts, buf, write }: DurationKeyContext) {
  return (e: KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest?.<HTMLElement>('[data-u]')
    if (!el) return
    const u = el.dataset.u as Unit
    const at = units().indexOf(u)
    const p = parts.value
    const size = (step()?.[u as 'h'] ?? (u === 'm' ? 5 : 1)) * SIZE[u] * (e.shiftKey ? 3 : 1)
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      buf.value = ''
      write(balance(totalSeconds(p) + (e.key === 'ArrowUp' ? size : -size), units()))
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault()
      const b = (buf.value + e.key).slice(-2)
      buf.value = b
      const n = +b
      write(n > MAX[u] && !carry() ? p : { ...p, [u]: n })
      if (b.length === 2 && at < units().length - 1) {
        buf.value = ''
        ;(group()!.querySelector(`[data-u="${units()[at + 1]}"]`) as HTMLElement).focus()
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      buf.value = ''
      write({ ...p, [u]: 0 })
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const to = units()[at + (e.key === 'ArrowRight' ? 1 : -1)]
      if (to) {
        e.preventDefault()
        ;(group()!.querySelector(`[data-u="${to}"]`) as HTMLElement).focus()
      }
    }
  }
}

type DurationControlContext = {
  units: () => Unit[]
  disabled: () => boolean | undefined
  required: () => boolean | undefined
  readonly name: string | undefined
  parts: { readonly value: DurationParts }
  buf: State<string>
  onKey: (e: KeyboardEvent) => void
  setGroup: (el: HTMLDivElement) => void
  say: (unit: Unit, value: number) => string
  value: () => IsoDuration | null
}

function durationControl(ctx: DurationControlContext) {
  return (
    <>
      <div
        ref={ctx.setGroup}
        data-part="segments"
        onKeyDown={ctx.onKey}
        onFocusOut={() => (ctx.buf.value = '')}
      >
        {ctx.units().map((u) => {
          const n = derived(() => ctx.parts.value[u])
          return (
            <>
              <span
                key={u}
                data-part="segment"
                data-u={u}
                role="spinbutton"
                tabindex={ctx.disabled() ? undefined : '0'}
                aria-label={NAMES[u]}
                aria-required={ctx.required() ? 'true' : undefined}
                aria-valuemin="0"
                aria-valuemax={MAX[u]}
                aria-valuenow={n.value}
                aria-valuetext={ctx.say(u, n.value)}
              >
                {u === ctx.units()[0] ? n.value : pad(n.value)}
              </span>
              <span data-part="literal" class="unit" aria-hidden="true">
                {SHORT[u]}
              </span>
            </>
          )
        })}
      </div>
      <Hidden name={ctx.name} value={() => ctx.value() ?? ''} />
    </>
  )
}

function sayDuration(locale: string, u: Unit, n: number) {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: INTL[u],
    unitDisplay: 'long',
  }).format(n)
}

/**
 * DurationField (04 §2): a spinbutton for each allowed unit; ↑/↓ step with carry into the next unit (Shift for three
 * steps), and digits fill. The value is an ISO duration, balanced (`PT90M` → `PT1H30M`) unless `balance: false`.
 */
export function DurationField({
  value,
  defaultValue,
  onValueChange,
  units = ['h', 'm'],
  max,
  step,
  balance: carry = true,
  locale,
  today,
  name,
  label,
  hint,
  error,
  disabled,
  ...rest
}: DurationFieldProps) {
  const env = usePickerEnv(
    () => locale,
    () => today,
  )
  const v = bindable<IsoDuration | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const parts = derived(() => parseDuration(v.value))
  const limit = untrack(() => (max ? totalSeconds(parseDuration(max)) : Infinity))
  const buf = state('')
  let group: HTMLDivElement | undefined
  const say = (u: Unit, n: number) => sayDuration(env.locale.value, u, n)
  const words = derived(() => {
    const p = parts.value
    const on = units.filter((u) => p[u])
    return on.length ? on.map((u) => say(u, p[u])).join(' ') : 'No time'
  })
  const write = (next: DurationParts, reason: 'keyboard' = 'keyboard') => {
    const t = Math.max(0, Math.min(limit, totalSeconds(next)))
    v.set(formatDuration(carry ? balance(t, units) : next), reason)
  }
  const onKey = durationKeys({
    units: () => units,
    step: () => step,
    carry: () => carry,
    group: () => group,
    parts,
    buf,
    write,
  })
  return (
    <Composite
      icon={TimerIcon}
      {...rest}
      label={label}
      hint={hint ?? words.value}
      error={error}
      disabled={disabled}
      bound={v}
      onReset={() => (buf.value = '')}
      filled={totalSeconds(parts.value) > 0}
      control={() =>
        durationControl({
          units: () => units,
          disabled: () => disabled,
          required: () => rest.required,
          get name() {
            return name
          },
          parts,
          buf,
          onKey,
          setGroup: (n) => (group = n),
          say,
          value: () => v.value,
        })
      }
    />
  )
}
