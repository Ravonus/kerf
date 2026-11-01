import { DownIcon } from '@weft/icons'
// Small pieces the admin pack shares. Internal: not exported from the barrel.
import { flush, type State, state, untrack, watch } from 'weft'
import '../fields'
import '@weft/ui-core/styles/inputs/choice.css'
import '@weft/ui-core/styles/inputs/text.css'

/** A value given plainly or as a State box. */
export const read = <T,>(v: T | State<T>): T => (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object) ? (v as State<T>).value : v as T)

/** The sweep's two spans, in every swept host. */
export const Sweep = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** Runs after the DOM has caught up: a focus move onto something this handler just rendered. */
export const afterFlush = (fn: () => void) => queueMicrotask(() => { flush(); fn() })

/** Goes true with `open` and stays: a closed overlay carries nothing until first opened, and keeps its close animation. */
export function latch(open: State<boolean>) {
  const on = state(untrack(() => open.value))
  watch(() => open.value, v => { if (v) on.value = true })
  return on
}

/** A close that can refuse, for dialogs that mustn't go yet. Modal only reads and writes `.value`. */
export const guarded = (open: State<boolean>, may: () => boolean) => ({
  get value() { return open.value },
  set value(v: boolean) { if (v || may()) open.value = v },
}) as State<boolean>

/** The compact select in a table cell (specimen `roleSel`): native, its label hidden beside it. */
export function InlineSelect({ id, label, value, options, describedby, onChange }: { id: string; label: string; value: string; options: { value: string; label: string }[]; describedby?: string; onChange: (e: Event & { currentTarget: HTMLSelectElement }) => void }) {
  return (
    <>
      <label data-part="sr-only" for={id}>{label}</label>
      <div data-scope="field" data-size="sm" data-variant="classic">
        <div data-part="control" data-filled="" data-sweep="">
          <Sweep />
          <select data-part="input" id={id} value={value} aria-describedby={describedby} onChange={onChange}>
            {options.map(o => <option key={o.value} value={o.value} selected={o.value === value}>{o.label}</option>)}
          </select>
          <span data-part="indicator" aria-hidden="true"><DownIcon /></span>
        </div>
      </div>
    </>
  )
}
