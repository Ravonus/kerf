import { field, installSweep, labelChars, uid } from '@weft/ui-core'
import { derived, onMount, untrack } from 'weft'
import { Icon, type IconName } from './Icon'
import { use } from './use'
import './fields'
import '@weft/ui-core/styles/inputs/text.css'

export interface FieldProps {
  /** The accessible name, drawn as the floating border label (or above, classic). Required. */
  label: string
  hint?: any
  /** Shown instead of the hint; marks the field invalid. */
  error?: any
  /** Leading icon: it sweeps with the border. */
  icon?: IconName
  prefix?: any
  suffix?: any
  /** floating (default, or the app's `warp({ fields })`) · classic: the label above. */
  variant?: 'floating' | 'classic'
  appearance?: 'line'
  size?: 'sm' | 'md' | 'lg'
  /** A clear button (shown once there is a value). */
  clearable?: boolean
  /** Maximum length, shown as a counter. */
  counter?: number
  id?: string
  value?: string
  disabled?: boolean
  readonly?: boolean
  [attr: string]: any
}

// `invalid` is a getter and `rest` the live props: the control is made once and its attributes update in place
type Control = (p: { id: string; describedby?: string; readonly invalid: boolean; rest: Record<string, any> }) => any

/**
 * The field shell (03 §1 anatomy, verbatim order): control (sweep-base, sweep, icon, label, prefix, input, suffix,
 * clear, end slot) then message (hint | error, counter). Everything is in the server HTML, label letters included;
 * after mount ui-core's field() measures the label's per-letter delays and notch and wires clear, counter and focus.
 */
export function Field({ label, hint, error, icon, prefix, suffix, variant, appearance, size, clearable, counter, id: given, control, end, filled, attrs, ...rest }: FieldProps & { control: Control; end?: any; filled?: boolean; attrs?: Record<string, any> }) {
  const id = untrack(() => given) ?? uid('field')
  const glyph = derived(() => icon)
  const message = untrack(() => hint !== undefined || error !== undefined || counter !== undefined)
  const msg = message ? `${id}-msg` : undefined
  // keyed by position: a label repeats letters
  const chars = derived(() => labelChars(String(label ?? '')).map((c, at) => ({ c, at })))
  // one omit() for every read: the compiler expands `rest` afresh at each use (the proxy reads stay live)
  const live = untrack(() => rest)
  let root: HTMLDivElement | undefined
  onMount(() => installSweep())
  use(field, () => root, () => [live.value, label] as const)
  return (
    <div
      ref={(n: any) => (root = n)}
      data-scope="field"
      data-variant={variant}
      data-appearance={appearance}
      data-size={size === 'md' ? undefined : size}
      data-counter={counter}
      data-invalid={error ? '' : undefined}
      data-disabled={live.disabled ? '' : undefined}
      data-readonly={live.readonly ? '' : undefined}
      {...attrs}
    >
      <div data-part="control" data-icon={glyph.value} data-sweep="" data-phase="idle" data-filled={filled ?? live.value ? '' : undefined}>
        <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
        {glyph.value && <span data-part="icon" aria-hidden="true"><span data-part="sweep-base"><Icon name={glyph.value} /></span><span data-part="sweep"><Icon name={glyph.value} /></span></span>}
        <label data-part="label" for={id}>
          <span data-part="label-text">{label}</span>
          <span data-part="label-chars" aria-hidden="true">{chars.value.map(x => <span key={x.at} data-char data-c={x.c}></span>)}</span>
        </label>
        {prefix !== undefined && <span data-part="prefix">{prefix}</span>}
        {untrack(() => control({ id, describedby: msg, get invalid() { return !!error }, rest: live }))}
        {suffix !== undefined && <span data-part="suffix">{suffix}</span>}
        {clearable && <button type="button" data-part="clear" tabindex="-1" aria-label={`Clear ${label}`}><Icon name="x" /></button>}
        {end}
      </div>
      {message && (
        <div data-part="message" id={msg}>
          {error ? <span data-part="error" role="alert"><Icon name="alert" /><span>{error}</span></span> : hint !== undefined && <span data-part="hint">{hint}</span>}
          {counter !== undefined && <span data-part="counter" aria-live="off"></span>}
        </div>
      )}
    </div>
  )
}

/** A text field. Every native input attribute passes through (type, autocomplete, inputmode, onInput…). */
export function Input({ placeholder, ...props }: FieldProps & { placeholder?: string; type?: string }) {
  return (
    <Field
      {...props}
      control={({ id, describedby, invalid, rest }) => (
        // a placeholder, " " at least: the label floats on :placeholder-shown (03 §1 decision 3)
        <input data-part="input" id={id} placeholder={placeholder ?? ' '} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} {...rest} />
      )}
    />
  )
}

/** A search field: the search icon, type=search, a clear button (03 §3 SearchInput; suggestions come with Combobox). */
export function Search({ placeholder, ...props }: FieldProps & { placeholder?: string }) {
  return (
    <Field
      icon="search"
      clearable
      {...props}
      attrs={{ role: 'search' }}
      control={({ id, describedby, invalid, rest }) => (
        <input data-part="input" id={id} type="search" enterkeyhint="search" autocomplete="off" placeholder={placeholder ?? ' '} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} {...rest} />
      )}
    />
  )
}

/** A textarea: grows from 3 lines to 10, Cmd/Ctrl+Enter submits its form (03 §3). */
export function Textarea({ placeholder, rows = 3, ...props }: FieldProps & { placeholder?: string; rows?: number }) {
  return (
    <Field
      {...props}
      control={({ id, describedby, invalid, rest }) => (
        <textarea data-part="input" id={id} rows={rows} enterkeyhint="enter" placeholder={placeholder ?? ' '} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} {...rest} />
      )}
    />
  )
}
