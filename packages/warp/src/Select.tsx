import { DownIcon } from '@weft/icons'
import { selectMenu } from '@weft/ui-core'
import { Field, type FieldProps } from './Field'
import { use } from './use'
import '@weft/ui-core/styles/inputs/choice.css' // the select and the field's chevron
import '@weft/ui-core/styles/components/listbox.css'

export type Option = { value: string; label: string; disabled?: boolean }
export type OptionGroup = { group: string; options: Option[] }

function Choice({ o }: { o: Option | OptionGroup }) {
  return <>{'group' in o
    ? <optgroup label={o.group}>{o.options.map(x => <option key={x.value} value={x.value} disabled={x.disabled}>{x.label}</option>)}</optgroup>
    : <option value={o.value} disabled={o.disabled}>{o.label}</option>}</>
}

/**
 * A select in the field shell. It stays a real <select>: the value, the form control, the name and the `change` event,
 * so no consumer knows the difference. On fine pointers selectMenu() opens warp's list instead of the OS popup; on
 * coarse pointers the OS sheet stays (03 §4, redesign §5).
 */
export function Select({ options, placeholder, ...props }: FieldProps & { options: (Option | OptionGroup)[]; placeholder?: string; onChange?: (e: Event) => void }) {
  let el: HTMLSelectElement | undefined
  use((sel: HTMLSelectElement) => {
    // with no value the first option shows, however the options were inserted
    if (props.value === undefined && placeholder === undefined) sel.selectedIndex = 0
    return selectMenu(sel)
  }, () => el)
  return (
    <Field
      {...props}
      filled
      end={<span data-part="indicator" aria-hidden="true"><DownIcon /></span>}
      control={p => (
        <select ref={(n: any) => (el = n)} data-part="input" id={p.id} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} {...p.rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(o => <Choice key={'group' in o ? o.group : o.value} o={o} />)}
        </select>
      )}
    />
  )
}
