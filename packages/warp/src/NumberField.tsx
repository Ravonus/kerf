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
  const shown = derived(() => (v.value === null ? '' : String(v.value)))
  let input: HTMLInputElement | undefined
  const write = (n: number | null) => {
    if (n !== untrack(() => v.value)) v.set(n, 'keyboard')
    if (input) input.value = n === null ? '' : String(n)
  }
  const nudge = (by: number) => write(fit((untrack(() => v.value) ?? opts.min() ?? 0) + by))
  const onKey = (e: KeyboardEvent) => {
    if (opts.disabled() || opts.readonly()) return
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
    const text = (e.currentTarget as HTMLInputElement).value.trim()
    const n = Number(text)
    if (text === '') v.set(null, 'keyboard')
    else if (Number.isFinite(n)) v.set(fit(n), 'keyboard')
  }

  const onBlur = () => {
    if (input) input.value = untrack(() => shown.value)
  }
  return [v, shown, nudge, onKey, onInput, onBlur, (n: HTMLInputElement) => (input = n)] as const
}

/**
 * A number in the field shell (03: `inputmode` over `type="number"`, which changes on a wheel, takes "e" and has its own
 * locale bugs). The input stays real text, so editing, paste and the numeric keypad are the OS's; Warp adds APG spinbutton
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
          ref={(n) => setInput(n)}
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
