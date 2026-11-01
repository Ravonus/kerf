import { DownIcon } from '@weft/icons'
import { Field, type FieldProps } from './Field'
import { use } from './use'
import '@weft/ui-core/styles/inputs/choice.css' // the select and the field's chevron

export type Option = { value: string; label: string; disabled?: boolean }
export type OptionGroup = { group: string; options: Option[] }

function Choice({ o }: { o: Option | OptionGroup }) {
  return <>{'group' in o
    ? <optgroup label={o.group}>{o.options.map(x => <option key={x.value} value={x.value} disabled={x.disabled}>{x.label}</option>)}</optgroup>
    : <option value={o.value} disabled={o.disabled}>{o.label}</option>}</>
}

/**
 * A select in the field shell, always a real <select>. On fine pointers, CSS gives it warp's list through base-select, with
 * no script; on touch and where that isn't supported the OS popup stays (03 §4, redesign §5). selectMenu() in @weft/ui-core
 * is the scripted list for an app that wants warp's list in every browser.
 */
export function Select({ options, placeholder, ...props }: FieldProps & { options: (Option | OptionGroup)[]; placeholder?: string; onChange?: (e: Event) => void }) {
  let el: HTMLSelectElement | undefined
  use((sel: HTMLSelectElement) => {
    // with no value the first option shows, however the options were inserted
    if (props.value === undefined && placeholder === undefined) sel.selectedIndex = 0
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
