import { DownIcon } from '@weft/icons'
import { Field, type FieldProps } from './Field'
import '@weft/ui-core/styles/inputs/choice.css' // the native select and the field's chevron

export type Option = { value: string; label: string; disabled?: boolean }
export type OptionGroup = { group: string; options: Option[] }

function Choice({ o }: { o: Option | OptionGroup }) {
  return <>{'group' in o
    ? <optgroup label={o.group}>{o.options.map(x => <option key={x.value} value={x.value} disabled={x.disabled}>{x.label}</option>)}</optgroup>
    : <option value={o.value} disabled={o.disabled}>{o.label}</option>}</>
}

/**
 * A select in the field shell, as the native element (03 §4 "Native vs custom select": the coarse-pointer twin,
 * inputs.html:559). The custom listbox for fine pointers comes with Combobox.
 */
export function Select({ options, placeholder, ...props }: FieldProps & { options: (Option | OptionGroup)[]; placeholder?: string; onChange?: (e: Event) => void }) {
  return (
    <Field
      {...props}
      filled
      end={<span data-part="indicator" aria-hidden="true"><DownIcon /></span>}
      control={p => (
        <select data-part="input" id={p.id} aria-describedby={p.describedby} aria-invalid={p.invalid ? 'true' : undefined} {...p.rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(o => <Choice key={'group' in o ? o.group : o.value} o={o} />)}
        </select>
      )}
    />
  )
}
