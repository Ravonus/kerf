// A Select of many: Select's own list (popover, sheet, search), where a pick turns a row on or off and the list stays open.
import { derived, omit, untrack, type State } from '@weft-js/core'
import { listbox, type ChangeReason, type Presentation } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { bindable } from './bind'
import { Field, type FieldShell } from './Field'
import { Chevron, FOR_CARRIER, LONG, OWN, listItems, type Option, type OptionGroup } from './Select'

/** Props for MultiSelect. */
export type MultiSelectProps = FieldShell & {
  label: string
  /** Each value posts as its own field under this name. */
  name?: string | undefined
  form?: string | undefined
  options: (Option | OptionGroup)[]
  /** Shown when nothing is on. */
  placeholder?: string
  value?: State<string[]> | string[]
  defaultValue?: string[]
  /** Called with every value that's on after a row is turned on or off, and whether a pointer, a key or code did it. */
  onValueChange?: (values: string[], reason: ChangeReason) => void
  open?: State<boolean> | boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  presentation?: Presentation
  /** Puts a search field at the top of the list. On by itself past 15 options. */
  searchable?: boolean
  /** How many picks the trigger names before it says "+N". */
  show?: number
}

const MULTI_OWN = [...OWN, 'show', 'name', 'form']

/** The values that are on, the trigger's words for them, and the list attached to the trigger. */
function useMulti(p: MultiSelectProps) {
  const v = bindable<string[]>(
    () => p.value,
    () => p.defaultValue,
    [],
    () => p.onValueChange,
  )
  const shown = bindable<boolean>(
    () => p.open,
    () => p.defaultOpen,
    false,
    () => p.onOpenChange,
  )
  // the placeholder is what the trigger says with nothing on, not a row to pick
  const items = listItems({
    get options() {
      return p.options
    },
  })
  const text = derived(() => {
    const names = items.value.filter((i) => v.value.includes(i.value)).map((i) => i.label)
    const n = p.show ?? 2
    return names.length <= n
      ? names.join(', ')
      : `${names.slice(0, n).join(', ')} +${names.length - n}`
  })
  let trigger: HTMLButtonElement | undefined
  use(
    listbox,
    () => trigger,
    () => ({
      open: p.open !== undefined || p.defaultOpen ? shown.value : undefined,
      label: p.label,
      items: items.value,
      value: '',
      multiple: true,
      values: v.value,
      presentation: p.presentation,
      search: p.searchable ?? items.value.length > LONG,
      onPick: (picked: string, reason: ChangeReason) => {
        const on = untrack(() => v.value)
        v.set(on.includes(picked) ? on.filter((x) => x !== picked) : [...on, picked], reason)
      },
      onOpenChange: (o: boolean) => {
        if (o !== untrack(() => shown.value)) shown.set(o)
      },
    }),
  )
  return { v, text, setTrigger: (n: HTMLButtonElement) => (trigger = n) }
}

/**
 * A Select of many. The trigger names what's on ("Oat milk, Vanilla +2"); a form gets one hidden input per value under
 * `name`, the way a multiple select posts them.
 */
export function MultiSelect(props: MultiSelectProps) {
  const p0 = untrack(() => props) // the props object is live; only its reads track
  const { v, text, setTrigger } = useMulti(p0)
  return (
    <Field
      {...omit(p0, MULTI_OWN)}
      label={p0.label}
      filled
      labelled
      reset={() => {
        if (untrack(() => p0.value) === undefined) v.reset()
      }}
      end={<Chevron />}
      control={(p) => (
        <>
          <button
            ref={setTrigger}
            type="button"
            data-part="input"
            id={p.id}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-labelledby={`${p.id}-l`}
            aria-describedby={p.describedby}
            aria-invalid={p.invalid ? 'true' : undefined}
            aria-required={p.rest.required ? 'true' : undefined}
            aria-readonly={p.rest.readonly ? 'true' : undefined}
            {...omit(p.rest, FOR_CARRIER)}
          >
            <span data-part="value" data-placeholder={p0.placeholder}>
              {text.value}
            </span>
          </button>
          {p0.name &&
            v.value.map((x) => (
              <input
                key={x}
                type="hidden"
                name={p0.name}
                form={p0.form}
                value={x}
                disabled={p.rest.disabled}
              />
            ))}
        </>
      )}
    />
  )
}
