import { AlertIcon, SearchIcon, XIcon } from '@weft-js/warp-icons'
import { field, formInvalid, formReset, labelChars, uid } from '@weft-js/warp-core'
import { derived, state, untrack } from '@weft-js/core'
import { Icon, type IconRef } from './Icon'
import { use } from '@weft-js/warp-core/weft'
import './fields'
import '@weft-js/warp-core/styles/inputs/text.css'

interface FieldBase {
  /** The accessible name, drawn as the floating border label (or above, classic). Required. */
  label: string
  hint?: unknown
  /** Shown instead of the hint; marks the field invalid. */
  error?: unknown
  /** Leading icon: it sweeps with the border. */
  icon?: IconRef | undefined
  /** Text or an element inside the field before the value, such as `$`. */
  prefix?: unknown
  /** Text or an element inside the field after the value, such as `kg`. */
  suffix?: unknown
  /** floating (default, or the app's `warp({ fields })`) · classic: the label above. */
  variant?: 'floating' | 'classic' | undefined
  /** `line`: only a bottom line under the value, no box or fill. The boxed field otherwise. */
  appearance?: 'line' | undefined
  size?: 'sm' | 'md' | 'lg' | undefined
  /** A clear button (shown once there is a value). */
  clearable?: boolean | undefined
  /** Maximum length, shown as a counter. */
  counter?: number | undefined
  id?: string | undefined
  value?: string | undefined
  disabled?: boolean | undefined
  /** Shows the value and lets it be selected and copied, but not changed. */
  readonly?: boolean | undefined
  onInput?: ((e: InputEvent & { currentTarget: HTMLInputElement & HTMLTextAreaElement }) => void) | undefined
}

/** Props for the text fields; anything else lands on the control. */
export interface FieldProps extends FieldBase { [attr: string]: unknown }

/** FieldProps for a component with its own value type: Omit on FieldProps would drop what the index signature hides. */
export type FieldShell = Omit<FieldBase, 'value' | 'defaultValue'> & { [attr: string]: unknown }

// `invalid` is a getter and `rest` the live props: the control is made once and its attributes update in place
export type Control = (p: { id: string; readonly describedby?: string | undefined; readonly invalid: boolean; rest: Record<string, unknown> }) => unknown

/**
 * The field shell (03 §1 anatomy, verbatim order): control (sweep-base, sweep, icon, label, prefix, input, suffix,
 * clear, end slot) then message (hint | error, counter). Everything is in the server HTML, label letters included;
 * after mount warp-core's field() measures the label's per-letter delays and notch and wires clear, counter and focus.
 */
export function Field({ label, hint, error, icon, prefix, suffix, variant, appearance, size, clearable, counter, id: given, control, end, filled, attrs, group, labelled, hold, wrap, reset, ...rest }: FieldProps & { control: Control; end?: unknown; filled?: boolean; attrs?: Record<string, unknown>; group?: boolean; /** The control takes its name from `aria-labelledby`, not `for`: a press on the label must not click a button. */ labelled?: boolean; hold?: boolean; wrap?: boolean; /** Puts held state back when the field's form resets. */ reset?: () => void }) {
  const id = untrack(() => given) ?? uid('field')
  // the browser's message for a constraint that failed (03 §1.3): `error` wins over it
  const missing = state<string | undefined>(undefined)
  const problem = derived(() => error ?? missing.value)
  const glyph = derived(() => icon)
  // an error can arrive long after mount, so the block and what points at it follow it
  const message = derived(() => hint !== undefined || !!problem.value || counter !== undefined)
  const msg = derived(() => (message.value ? `${id}-msg` : undefined))
  // keyed by position: a label repeats letters
  const chars = derived(() => labelChars(String((label as string | number | undefined) ?? '')).map((c, at) => ({ c, at })))
  // one omit() for every read: the compiler expands `rest` afresh at each use (the proxy reads stay live)
  const live = untrack(() => rest)
  let root: HTMLDivElement | undefined
  const shell = { id, get describedby() { return msg.value }, get invalid() { return !!problem.value }, rest: live }
  use(field, () => root, () => [live.value, label] as const)
  use(formInvalid, () => root, () => (m: string | undefined) => (missing.value = m))
  if (untrack(() => reset)) use(formReset, () => root, () => () => reset!())
  return (
    <div
      ref={n => (root = n)}
      data-scope="field"
      data-variant={variant}
      data-appearance={appearance}
      data-size={size === 'md' ? undefined : size}
      data-counter={counter}
      data-invalid={problem.value ? '' : undefined}
      data-disabled={live.disabled ? '' : undefined}
      data-readonly={live.readonly ? '' : undefined}
      {...attrs}
    >
      <div data-part="control" data-icon={typeof glyph.value === 'string' ? glyph.value : glyph.value ? '' : undefined} data-sweep="" data-filled={filled ?? live.value ? '' : undefined} data-hold={hold ? '' : undefined} data-wrap={wrap ? '' : undefined}>
        <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
        {glyph.value && <span data-part="icon" aria-hidden="true"><span data-part="sweep-base"><Icon name={glyph.value} /></span><span data-part="sweep"><Icon name={glyph.value} /></span></span>}
        <label data-part="label" for={group || labelled ? undefined : id} id={group || labelled ? `${id}-l` : undefined}>
          <span data-part="label-text">{label}</span>
          <span data-part="label-chars" aria-hidden="true">{chars.value.map(x => <span key={x.at} data-char data-c={x.c}></span>)}</span>
        </label>
        {prefix !== undefined && <span data-part="prefix">{prefix}</span>}
        {group
          ? <div data-part="body" role="group" aria-labelledby={`${id}-l`} aria-describedby={msg.value} aria-invalid={problem.value ? 'true' : undefined}>{untrack(() => control(shell))}</div>
          : untrack(() => control(shell))}
        {suffix !== undefined && <span data-part="suffix">{suffix}</span>}
        {clearable && <button type="button" data-part="clear" tabindex="-1" aria-label={`Clear ${label}`}><XIcon /></button>}
        {end}
      </div>
      {message.value && (
        <div data-part="message" id={msg.value}>
          {problem.value ? <span data-part="error" role="alert"><AlertIcon /><span>{problem.value}</span></span> : hint !== undefined && <span data-part="hint">{hint}</span>}
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
      control={p => (
        // a placeholder, " " at least: the label floats on :placeholder-shown (03 §1 decision 3)
        <input data-part="input" id={p.id} placeholder={placeholder ?? ' '} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} {...p.rest} />
      )}
    />
  )
}

/** A search field: the search icon, type=search, a clear button (03 §3 SearchInput; suggestions come with Combobox). */
export function Search({ placeholder, ...props }: FieldProps & { placeholder?: string }) {
  return (
    <Field
      icon={SearchIcon}
      clearable
      {...props}
      attrs={{ role: 'search' }}
      control={p => (
        <input data-part="input" id={p.id} type="search" enterkeyhint="search" autocomplete="off" placeholder={placeholder ?? ' '} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} {...p.rest} />
      )}
    />
  )
}

/** A textarea: grows from `rows` lines (3) to 10 or `rows`, Cmd/Ctrl+Enter submits its form (03 §3). */
export function Textarea({ placeholder, rows = 3, ...props }: FieldProps & { placeholder?: string; rows?: number }) {
  return (
    <Field
      {...props}
      control={p => (
        // field-sizing: content ignores the rows attribute, so the height reads it from --_rows
        <textarea data-part="input" id={p.id} rows={rows} style={`--_rows:${rows}`} enterkeyhint="enter" placeholder={placeholder ?? ' '} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} {...p.rest}>{untrack(() => p.rest.value)}</textarea>
      )}
    />
  )
}
