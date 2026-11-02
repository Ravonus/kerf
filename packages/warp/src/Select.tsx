import { DownIcon } from '@weft/icons'
import { flush, derived, omit, state, untrack, type State } from 'weft'
import { formReset, listbox, uid, type ChangeReason, type ListItem, type Presentation } from '@weft/warp-core'
import { bindable } from './bind'
import { Field, type FieldProps } from './Field'
import { use } from '@weft/warp-core/weft'
import './fields'
import '@weft/warp-core/styles/components/listbox.css'
import '@weft/warp-core/styles/inputs/choice.css' // the select and the field's chevron

export type Option = { value: string; label: string; disabled?: boolean; /** A second, quieter line of text in the row. */ hint?: string }
export type OptionGroup = { group: string; options: Option[] }

/** Past this many options a Select searches (03 §4); `searchable` says so either way. */
const LONG = 15

const Item = ({ o, on }: { o: Option; on: string }) => <option value={o.value} disabled={o.disabled} selected={o.value === on}>{o.label}</option>

function Choice({ o, on }: { o: Option | OptionGroup; on: string }) {
  return <>{'group' in o
    ? <optgroup label={o.group}>{o.options.map(x => <Item key={x.value} o={x} on={on} />)}</optgroup>
    : <Item o={o} on={on} />}</>
}

interface ListProps {
  label: string
  options: (Option | OptionGroup)[]
  placeholder?: string
  value?: State<string | null> | string | null
  defaultValue?: string | null
  onValueChange?: (value: string, reason: ChangeReason) => void
  open?: State<boolean> | boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  presentation?: Presentation
  searchable?: boolean
}

const OWN = ['options', 'placeholder', 'value', 'defaultValue', 'onValueChange', 'open', 'defaultOpen', 'onOpenChange', 'presentation', 'searchable']

/**
 * What a Select holds, with or without a form behind it: the value, the row list and its action on the trigger. The
 * carrier, when there is one, is a real <select>: `onChange`, `selectedOptions`, `required`, reset and autofill all stay
 * true on it. A pick writes it and fires its events, and whatever a handler then writes to it stands, so code that puts
 * `el.value` back still works.
 */
function useList(props: ListProps) {
  const v = bindable<string | null>(() => props.value as any, () => props.defaultValue ?? undefined, null, () => props.onValueChange as any)
  const shown = bindable<boolean>(() => props.open, () => props.defaultOpen, false, () => props.onOpenChange as any)
  const items = derived<ListItem[]>(() => [
    ...(props.placeholder !== undefined ? [{ value: '', label: props.placeholder }] : []),
    ...props.options.flatMap(o => ('group' in o ? o.options.map(x => ({ value: x.value, label: x.label, disabled: x.disabled, hint: x.hint, group: o.group })) : [o])),
  ])
  // with no value the first option shows, as a select does
  const current = derived(() => v.value ?? items.value.find(i => !i.disabled)?.value ?? '')
  const text = derived(() => { const c = current.value; return c === '' ? '' : items.value.find(i => i.value === c)?.label ?? '' })
  let trigger: HTMLButtonElement | undefined
  let carrier: HTMLSelectElement | undefined
  let picking = false
  const hold = () => { if (carrier && carrier.value !== current.value) carrier.value = current.value }
  const read = () => { if (carrier && !picking && carrier.value !== current.value) v.set(carrier.value, 'programmatic') }
  const pick = (next: string, reason: ChangeReason) => {
    if (!carrier) return v.set(next, reason)
    picking = true
    carrier.value = next
    carrier.dispatchEvent(new Event('input', { bubbles: true }))
    carrier.dispatchEvent(new Event('change', { bubbles: true }))
    picking = false
    v.set(carrier.value, reason)
    flush()
    hold() // a value the binding holds stands
  }
  use(listbox, () => trigger, () => ({
    open: props.open !== undefined || props.defaultOpen ? shown.value : undefined,
    label: props.label,
    items: items.value,
    value: current.value,
    presentation: props.presentation,
    search: props.searchable ?? items.value.length > LONG,
    onPick: pick,
    onOpenChange: (o: boolean) => { if (o !== untrack(() => shown.value)) shown.set(o) },
  }))
  use((sel: HTMLSelectElement) => {
    // autofill, and code that writes the select, arrive here
    sel.addEventListener('change', read)
    hold()
    return { update: hold, destroy() { sel.removeEventListener('change', read) } }
  }, () => carrier, () => [current.value, items.value])
  return {
    current,
    text,
    /** Code that wrote the select with no event: the trigger catches up on focus. */
    refresh: read,
    onReset() {
      if (untrack(() => props.value) === undefined) v.reset()
      hold()
    },
    trigger: (n: any) => (trigger = n),
    carrier: (n: any) => (carrier = n),
    focusTrigger: () => trigger?.focus(),
  }
}

const Chevron = () => <span data-part="indicator" aria-hidden="true"><DownIcon /></span>
const FOR_CARRIER = ['name', 'form', 'required', 'autocomplete', 'onChange', 'onInput', 'readonly']

/**
 * A select in the field shell, drawn by warp on every device: a popover on a desktop, a sheet on a phone (03 §4), a search
 * input once the list is long. The trigger is a button (APG select-only combobox), and a hidden real <select> is the form
 * value, so a form posts, resets and validates as it always did, and with scripting off that select is what shows.
 * Handlers read `e.currentTarget.value` as usual; `onValueChange` hears the value and why.
 */
export function Select(props: Omit<FieldProps, 'value' | 'defaultValue'> & ListProps & { onChange?: (e: Event & { currentTarget: HTMLSelectElement }) => void }) {
  const list = useList(untrack(() => props)) // the props object is live; only its reads track
  return (
    <Field
      {...omit(props, OWN)}
      filled
      labelled
      reset={list.onReset}
      end={<Chevron />}
      control={p => (
        <>
          <button
            ref={list.trigger}
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
            onFocus={list.refresh}
            {...omit(p.rest, FOR_CARRIER)}
          >
            <span data-part="value" data-placeholder={props.placeholder}>{list.text.value}</span>
          </button>
          <select
            ref={list.carrier}
            data-part="carrier"
            tabindex="-1"
            aria-hidden="true"
            name={p.rest.name}
            form={p.rest.form}
            required={p.rest.required}
            autocomplete={p.rest.autocomplete}
            disabled={p.rest.disabled}
            onChange={(e: Event) => p.rest.onChange?.(e)}
            onInput={(e: Event) => p.rest.onInput?.(e)}
            onFocus={list.focusTrigger}
          >
            {props.placeholder !== undefined && <option value="" selected={untrack(() => list.current.value) === ''}>{props.placeholder}</option>}
            {props.options.map(o => <Choice key={'group' in o ? o.group : o.value} o={o} on={untrack(() => list.current.value)} />)}
          </select>
        </>
      )}
    />
  )
}

/**
 * The Select of a table row, a pager or a toolbar (03 §4): the same list with no floating label, `label` its accessible
 * name. It carries no <option> until it opens, and no <select> at all unless `name` puts it in a form.
 */
export function CompactSelect(props: ListProps & { name?: string; id?: string; disabled?: boolean; describedby?: string }) {
  const list = useList(untrack(() => props)) // the props object is live; only its reads track
  const id = untrack(() => props.id) ?? uid('sel')
  return (
    <div data-scope="field" data-variant="classic" data-size="sm" data-compact="">
      <div data-part="control" data-filled="" data-sweep="">
        <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
        <button ref={list.trigger} type="button" data-part="input" id={id} role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label={props.label} aria-describedby={props.describedby} disabled={props.disabled}>
          <span data-part="value" data-placeholder={props.placeholder}>{list.text.value}</span>
        </button>
        {props.name && <input type="hidden" name={props.name} value={list.current.value} />}
        <Chevron />
      </div>
    </div>
  )
}
