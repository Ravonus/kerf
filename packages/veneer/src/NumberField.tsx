import { DownIcon } from '@kerf-js/veneer-icons'
import { derived, state, untrack } from '@kerf-js/core'
import { bindable, type Bindable } from './bind'
import { Field, type FieldShell } from './Field'
import '@kerf-js/veneer-core/styles/inputs/text.css'

/** Props for NumberField. */
export type NumberFieldProps = FieldShell &
  Bindable<number | null> & {
    min?: number
    max?: number
    step?: number
    name?: string
    required?: boolean
  }

const PAGE = 10

type NumberOptions = {
  value: () => NumberFieldProps['value']
  initial: () => NumberFieldProps['defaultValue']
  onChange: () => NumberFieldProps['onValueChange']
  min: () => number | undefined
  max: () => number | undefined
  step: () => number
  disabled: () => boolean | undefined
  readonly: () => boolean | undefined
}

function numberModel(opts: NumberOptions) {
  const v = bindable<number | null>(opts.value, opts.initial, null, opts.onChange)
  const fit = (n: number) => Math.min(opts.max() ?? Infinity, Math.max(opts.min() ?? -Infinity, n))
  const draft = state<string | null>(null)
  const shown = derived(() => draft.value ?? (v.value === null ? '' : String(v.value)))
  const number = (text: string) => {
    const n = Number(text.trim())
    return text.trim() !== '' && Number.isFinite(n) ? n : undefined
  }
  let input: HTMLInputElement | undefined
  const write = (n: number | null) => {
    draft.value = null
    if (n !== untrack(() => v.value)) v.set(n, 'keyboard')
    if (input) input.value = n === null ? '' : String(n)
  }
  const discard = () => {
    draft.value = null
    if (input) input.value = untrack(() => shown.value)
  }
  const commit = () => {
    const raw = untrack(() => draft.value)
    if (raw === null) return discard()
    const n = number(raw)
    write(raw.trim() === '' ? null : n === undefined ? untrack(() => v.value) : fit(n))
  }
  const nudge = (by: number) => {
    const raw = untrack(() => draft.value)
    const n = raw === null ? undefined : number(raw)
    write(fit((n ?? untrack(() => v.value) ?? opts.min() ?? 0) + by))
  }
  const onKey = (e: KeyboardEvent) => {
    if (opts.disabled() || opts.readonly()) return
    if (e.key === 'Escape') return discard()
    if (e.key === 'Enter') return commit()
    const by = (
      {
        ArrowUp: opts.step(),
        ArrowDown: -opts.step(),
        PageUp: opts.step() * PAGE,
        PageDown: -opts.step() * PAGE,
      } as Record<string, number>
    )[e.key]
    if (by) {
      e.preventDefault()
      return nudge(by)
    }
    if (e.key === 'Home' && opts.min() !== undefined) {
      e.preventDefault()
      write(opts.min()!)
    }
    if (e.key === 'End' && opts.max() !== undefined) {
      e.preventDefault()
      write(opts.max()!)
    }
  }

  const onInput = (e: Event) => {
    if (opts.disabled() || opts.readonly()) return
    const raw = (e.currentTarget as HTMLInputElement).value
    draft.value = raw
    const n = number(raw)
    if (raw.trim() === '') {
      if (untrack(() => v.value) !== null) v.set(null, 'keyboard')
    } else if (n !== undefined && fit(n) === n && n !== untrack(() => v.value)) v.set(n, 'keyboard')
  }

  const onBlur = () => {
    if (opts.disabled() || opts.readonly()) discard()
    else commit()
  }
  return [v, shown, nudge, onKey, onInput, onBlur, (n: HTMLInputElement) => (input = n)] as const
}

/**
 * A number in the field shell (03: `inputmode` over `type="number"`, which changes on a wheel, takes "e" and has its own
 * locale bugs). The input stays real text, so editing, paste and the numeric keypad are the OS's; Veneer adds APG spinbutton
 * keys (↑/↓, Page keys, Home/End with a bound) and two steppers. A raw draft preserves partial input; only in-range values
 * are emitted while typing. Blur/Enter clamp a numeric draft; Escape discards it before bubbling.
 */
export function NumberField({
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  step = 1,
  name,
  disabled,
  readonly,
  ...rest
}: NumberFieldProps) {
  const [v, shown, nudge, onKey, onInput, onBlur, setInput] = numberModel({
    value: () => value,
    initial: () => defaultValue,
    onChange: () => onValueChange,
    min: () => min,
    max: () => max,
    step: () => step,
    disabled: () => disabled,
    readonly: () => readonly,
  })
  const stepper = (label: string, by: number, off: boolean) => (
    <button
      type="button"
      data-part="step"
      tabindex="-1"
      aria-label={label}
      disabled={disabled || readonly || off}
      onMouseDown={(e: Event) => e.preventDefault()}
      onClick={() => nudge(by)}
    >
      <DownIcon />
    </button>
  )
  return (
    <Field
      {...rest}
      disabled={disabled}
      readonly={readonly}
      filled={shown.value !== ''}
      end={
        <span data-part="steps">
          {stepper('Increase', step, max !== undefined && v.value !== null && v.value >= max)}
          {stepper('Decrease', -step, min !== undefined && v.value !== null && v.value <= min)}
        </span>
      }
      control={(p) => (
        <input
          ref={setInput}
          data-part="input"
          id={p.id}
          role="spinbutton"
          type="text"
          inputmode={step % 1 || (min ?? 0) < 0 ? 'decimal' : 'numeric'}
          autocomplete="off"
          name={name}
          placeholder=" "
          required={p.rest.required}
          disabled={disabled}
          readonly={readonly}
          value={shown.value}
          aria-valuenow={v.value ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          onInput={onInput}
          onKeyDownCapture={onKey}
          onBlur={onBlur}
        />
      )}
    />
  )
}
