import { Field, type FieldProps } from './Field'
import { Icon } from './Icon'
import '@weft/ui-core/styles/inputs/choice.css' // the native select and the field's chevron

export type Option = { value: string; label: string; disabled?: boolean }
export type OptionGroup = { group: string; options: Option[] }

/**
 * A select in the field shell, as the native element (03 §4 "Native vs custom select": the coarse-pointer twin,
 * inputs.html:559). The custom listbox for fine pointers comes with Combobox.
 */
export function Select({ options, placeholder, ...props }: FieldProps & { options: (Option | OptionGroup)[]; placeholder?: string; onChange?: (e: Event) => void }) {
  const one = (o: Option) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
  return (
    <Field
      {...props}
      filled
      end={<span data-part="indicator" aria-hidden="true"><Icon name="down" /></span>}
      control={({ id, describedby, invalid, rest }) => (
        <select data-part="input" id={id} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map(o => ('group' in o ? <optgroup key={o.group} label={o.group}>{o.options.map(one)}</optgroup> : one(o)))}
        </select>
      )}
    />
  )
}
