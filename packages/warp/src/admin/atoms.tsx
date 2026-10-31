// Small pieces the admin pack shares. Internal: not exported from the barrel.
import { flush, type State, state, untrack, watch } from 'weft'
import { Icon } from '../Icon'
import '../fields'
import '@weft/ui-core/styles/inputs/choice.css'
import '@weft/ui-core/styles/inputs/text.css'

export const GLYPH = {
  trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5',
  plus: 'M12 5.5v13M5.5 12h13',
  minus: 'M5.5 12h13',
  key: 'M14.5 4a5.5 5.5 0 0 0-5.2 7.3L4 16.5V20h3.5v-2H10v-2.5h2.2l1.1-1.1A5.5 5.5 0 1 0 14.5 4zM16 8h.01',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  doc: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4M10 12.5h5M10 16h5',
  download: 'M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14',
  upload: 'M12 16V5M7.5 9.5 12 5l4.5 4.5M5 19.5h14',
  bag: 'M5.5 8h13l1 12.5h-15zM9 8V6.5a3 3 0 0 1 6 0V8',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.5-4 3-6 6-6s5.5 2 6 6M15.5 4.3a3.5 3.5 0 0 1 0 6.4M17.5 14.5c2 .8 3.2 2.7 3.5 5.5',
  out: 'M9 6.5h8.500V15M17.5 6.5 6.5 17.5',
}

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
        <div data-part="control" data-filled="" data-sweep="" data-phase="idle">
          <Sweep />
          <select data-part="input" id={id} value={value} aria-describedby={describedby} onChange={onChange}>
            {options.map(o => <option key={o.value} value={o.value} selected={o.value === value}>{o.label}</option>)}
          </select>
          <span data-part="indicator" aria-hidden="true"><Icon name="down" /></span>
        </div>
      </div>
    </>
  )
}
