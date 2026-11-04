import { DownIcon } from '@weft-js/warp-icons'
import { derived, untrack } from '@weft-js/core'
import { bindable, type Bindable } from './bind'
import { Field, type FieldShell } from './Field'
import '@weft-js/warp-core/styles/inputs/text.css'

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

/**
 * A number in the field shell (03: `inputmode` over `type="number"`, which changes on a wheel, takes "e" and has its own
 * locale bugs). The input stays real text, so editing, paste and the numeric keypad are the OS's; warp adds APG spinbutton
 * keys (↑/↓, Page keys, Home/End with a bound) and two steppers. Text that isn't a number leaves the value alone until blur.
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
  const v = bindable<number | null>(
    () => value,
    () => defaultValue,
    null,
    () => onValueChange,
  )
  const fit = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const shown = derived(() => (v.value === null ? '' : String(v.value)))
  let input: HTMLInputElement | undefined
  const write = (n: number | null) => {
    if (n !== untrack(() => v.value)) v.set(n, 'keyboard')
    if (input) input.value = n === null ? '' : String(n)
  }
  const nudge = (by: number) => write(fit((untrack(() => v.value) ?? min ?? 0) + by))
  const onKey = (e: KeyboardEvent) => {
    if (disabled || readonly) return
    const by = (
      { ArrowUp: step, ArrowDown: -step, PageUp: step * PAGE, PageDown: -step * PAGE } as Record<
        string,
        number
      >
    )[e.key]
    if (by) {
      e.preventDefault()
      return nudge(by)
    }
    if (e.key === 'Home' && min !== undefined) {
      e.preventDefault()
      write(min)
    }
    if (e.key === 'End' && max !== undefined) {
      e.preventDefault()
      write(max)
    }
  }
  const onInput = (e: Event) => {
    const text = (e.currentTarget as HTMLInputElement).value.trim()
    const n = Number(text)
    if (text === '') v.set(null, 'keyboard')
    else if (Number.isFinite(n)) v.set(fit(n), 'keyboard')
  }
  const onBlur = () => {
    if (input) input.value = untrack(() => shown.value)
  }
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
          ref={(n) => (input = n)}
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
          onKeyDown={onKey}
          onBlur={onBlur}
        />
      )}
    />
  )
}
