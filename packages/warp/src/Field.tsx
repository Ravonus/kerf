import { SearchIcon } from '@weft-js/warp-icons'
import { field, formInvalid, formReset, labelChars, uid } from '@weft-js/warp-core'
import { derived, state, untrack, omit } from '@weft-js/core'
import type { IconRef } from './Icon'
import { fieldView } from './Field/view'
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
  onInput?:
    | ((e: InputEvent & { currentTarget: HTMLInputElement & HTMLTextAreaElement }) => void)
    | undefined
}

/** Props for the text fields; anything else lands on the control. */
export interface FieldProps extends FieldBase {
  [attr: string]: unknown
}

/** FieldProps for a component with its own value type: Omit on FieldProps would drop what the index signature hides. */
export type FieldShell = Omit<FieldBase, 'value' | 'defaultValue'> & { [attr: string]: unknown }

// `invalid` is a getter and `rest` the live props: the control is made once and its attributes update in place
export type Control = (p: {
  id: string
  readonly describedby?: string | undefined
  readonly invalid: boolean
  rest: Record<string, unknown>
}) => unknown

/** `labelChars`, which only needs `Intl.Segmenter` past ASCII: making one is most of the work of mounting a field. */
export const letters = (s: string) =>
  /^[ -~]*$/.test(s) ? s.trim().replace(/ +/g, ' ').split('') : labelChars(s)

/**
 * The field shell (03 §1 anatomy, verbatim order): control (sweep-base, sweep, icon, label, prefix, input, suffix,
 * clear, end slot) then message (hint | error, counter). Everything is in the server HTML, label letters included;
 * after mount warp-core's field() measures the label's per-letter delays and notch and wires clear, counter and focus.
 */
export function Field(
  props: FieldProps & {
    control: Control
    end?: unknown
    filled?: boolean
    attrs?: Record<string, unknown>
    group?: boolean
    /** The control takes its name from `aria-labelledby`, not `for`: a press on the label must not click a button. */ labelled?: boolean
    hold?: boolean
    wrap?: boolean
    /** Puts held state back when the field's form resets. */ reset?: () => void
  },
) {
  return setupField(untrack(() => props))
}

const OWN = [
  'label',
  'hint',
  'error',
  'icon',
  'prefix',
  'suffix',
  'variant',
  'appearance',
  'size',
  'clearable',
  'counter',
  'id',
  'control',
  'end',
  'filled',
  'attrs',
  'group',
  'labelled',
  'hold',
  'wrap',
  'reset',
]

function setupField(p: Parameters<typeof Field>[0]) {
  const rest: Record<string, unknown> = omit(p, OWN)
  const id = untrack(() => p.id) ?? uid('field')
  // the browser's message for a constraint that failed (03 §1.3): `error` wins over it
  const missing = state<string | undefined>(undefined)
  const problem = derived(() => p.error ?? missing.value)
  const glyph = derived(() => p.icon)
  // an error can arrive long after mount, so the block and what points at it follow it
  const message = derived(() => p.hint !== undefined || !!problem.value || p.counter !== undefined)
  const msg = derived(() => (message.value ? `${id}-msg` : undefined))
  // keyed by position: a label repeats letters
  const chars = derived(() =>
    letters(String((p.label as string | number | undefined) ?? '')).map((c, at) => ({ c, at })),
  )
  // The control keeps one rest view whose prop reads stay live.
  const live = untrack(() => rest)
  let root: HTMLDivElement | undefined
  const shell = {
    id,
    get describedby() {
      return msg.value
    },
    get invalid() {
      return !!problem.value
    },
    rest: live,
  }
  use(
    field,
    () => root,
    () => [live.value, p.label] as const,
  )
  use(
    formInvalid,
    () => root,
    () => (m: string | undefined) => (missing.value = m),
  )
  if (untrack(() => p.reset))
    use(
      formReset,
      () => root,
      () => () => p.reset!(),
    )
  return fieldView(
    p,
    id,
    problem,
    glyph,
    message,
    msg,
    chars,
    live,
    shell,
    (n: HTMLDivElement) => (root = n),
  )
}

/** A text field. Every native input attribute passes through (type, autocomplete, inputmode, onInput…). */
export function Input({
  placeholder,
  ...props
}: FieldProps & { placeholder?: string; type?: string }) {
  return (
    <Field
      {...props}
      control={(p) => (
        // a placeholder, " " at least: the label floats on :placeholder-shown (03 §1 decision 3)
        <input
          data-part="input"
          id={p.id}
          placeholder={placeholder ?? ' '}
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          {...p.rest}
        />
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
      control={(p) => (
        <input
          data-part="input"
          id={p.id}
          type="search"
          enterkeyhint="search"
          autocomplete="off"
          placeholder={placeholder ?? ' '}
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          {...p.rest}
        />
      )}
    />
  )
}

/** A textarea: grows from `rows` lines (3) to 10 or `rows`, Cmd/Ctrl+Enter submits its form (03 §3). */
export function Textarea({
  placeholder,
  rows = 3,
  ...props
}: FieldProps & { placeholder?: string; rows?: number }) {
  return (
    <Field
      {...props}
      control={(p) => (
        // field-sizing: content ignores the rows attribute, so the height reads it from --_rows
        <textarea
          data-part="input"
          id={p.id}
          rows={rows}
          style={`--_rows:${rows}`}
          enterkeyhint="enter"
          placeholder={placeholder ?? ' '}
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          {...p.rest}
        >
          {untrack(() => p.rest.value)}
        </textarea>
      )}
    />
  )
}
