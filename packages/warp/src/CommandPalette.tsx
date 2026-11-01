import { IconSearch } from '@weft/icons'
import { dialog, installSweep, listKey, marked, paletteHotkey, rankCommands, uid } from '@weft/ui-core'
import { derived, flush, onMount, state, untrack, watch } from 'weft'
import { bindable, type Openable } from './bind'
import { Icon, type IconRef } from './Icon'
import { Kbd } from './Kbd'
import { use } from './use'
import './styles'
import '@weft/ui-core/styles/components/dialog.css'
import '@weft/ui-core/styles/components/menu.css'
import '@weft/ui-core/styles/components/command-palette.css'

export interface Command {
  id?: string
  label: string
  /** Rows gather under their group's heading. */
  group?: string
  icon?: IconRef
  shortcut?: string
  /** More words it answers to. */
  keywords?: string[]
  run?: () => void
}

export type CommandPaletteProps = Openable & {
  commands: Command[]
  /** Hears every command run, however it was picked. */
  onRun?: (command: Command, reason: 'pointer' | 'keyboard') => void
  label?: string
  placeholder?: string
  /** The key that opens it with ⌘ or Ctrl. `false` leaves opening to the app. */
  hotkey?: string | false
}

/**
 * The command palette (05 §3; components.html:1109-1113, 1704-1754): an APG combobox in a modal <dialog>. Focus stays in
 * the input, ↑/↓ and PageUp/PageDown move the active row, Enter runs it, Esc closes and returns focus. Rows are fuzzy
 * ranked and appear only while it's open, so a closed palette costs a page one empty dialog.
 */
export function CommandPalette({ open, defaultOpen, onOpenChange, commands, onRun, label = 'Command palette', placeholder = 'Search or run a command…', hotkey = 'k' }: CommandPaletteProps) {
  const id = uid('pal')
  const flag = bindable<boolean>(() => open, () => defaultOpen, false, () => o => onOpenChange?.(o))
  const typed = state('')
  const active = state(0)
  const groups = derived(() => (flag.value ? rankCommands(commands, typed.value) : []))
  // the rows in the order the arrows walk them
  const rows = derived(() => groups.value.flatMap(g => g.rows))
  const indexOf = (c: Command) => rows.value.findIndex(r => r.item === c)
  const result = derived(() => { const n = rows.value.length; return !flag.value ? '' : n ? `${n} ${n === 1 ? 'command' : 'commands'}` : 'No results' })
  let el: HTMLDialogElement | undefined
  let input: HTMLInputElement | undefined
  use(dialog, () => el, () => ({ open: flag.value, onClose: () => flag.set(false) }))
  if (untrack(() => hotkey) !== false) use(paletteHotkey, () => el, () => ({ key: String(hotkey), onPress: () => flag.set(!untrack(() => flag.value)) }))
  onMount(() => installSweep())
  watch(() => flag.value, on => {
    if (!on) return
    typed.value = ''
    active.value = 0
    if (input) input.value = ''
  })
  watch(() => typed.value, () => { active.value = 0 })
  const run = (at: number, reason: 'pointer' | 'keyboard') => {
    const c = rows.value[at]?.item
    if (!c) return
    flag.set(false)
    flush()
    // after the dialog has gone, so what the command opens takes focus from the opener
    queueMicrotask(() => { c.run?.(); onRun?.(c, reason) })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return
    const count = rows.value.length
    if (!count) return
    const m = listKey(e.key, active.value, count, { wrap: true, typing: true, page: 5 })
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return run(active.value, 'keyboard')
    active.value = m.to
    flush()
    el?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }
  return (
    <dialog ref={(n: any) => (el = n)} data-scope="palette" aria-label={label}>
      <div data-part="input-row" data-sweep="" data-phase="idle" data-hold={flag.value ? '' : undefined}>
        <span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span>
        <IconSearch />
        <label for={`${id}-in`} data-part="sr-only">{label}</label>
        <input ref={(n: any) => (input = n)} data-initial="" data-part="input" id={`${id}-in`} role="combobox" aria-expanded="true" aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={rows.value.length ? `${id}-${active.value}` : undefined} placeholder={placeholder} autocomplete="off" spellcheck={false} onInput={(e: any) => (typed.value = e.currentTarget.value)} onKeyDown={onKey} />
        <Kbd>esc</Kbd>
      </div>
      <div data-part="list" role="listbox" id={`${id}-list`} aria-label="Commands">
        {groups.value.map(g => (
          <div key={g.name} role="group" aria-label={g.name || 'Commands'}>
            {g.name && <div data-part="group-label" aria-hidden="true">{g.name}</div>}
            {g.rows.map(r => {
              const at = () => indexOf(r.item)
              return (
                <div key={r.item.id ?? r.item.label} data-part="item" role="option" id={`${id}-${at()}`} aria-selected={at() === active.value ? 'true' : 'false'} onPointerMove={() => { if (active.value !== at()) active.value = at() }} onClick={() => run(at(), 'pointer')}>
                  {r.item.icon && <Icon name={r.item.icon} />}
                  <span>{marked(r.item.label, r.hits).map((run, n) => (run.hit ? <mark key={`${n}${run.text}`}>{run.text}</mark> : <span key={`${n}${run.text}`}>{run.text}</span>))}</span>
                  {r.item.shortcut && <span data-part="shortcut">{r.item.shortcut}</span>}
                </div>
              )
            })}
          </div>
        ))}
        {flag.value && !rows.value.length && <div data-part="empty">{`No commands match “${typed.value}”.`}</div>}
      </div>
      <span data-part="sr-only" role="status">{result.value}</span>
      <div data-part="footer" aria-hidden="true"><span><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span><span><Kbd>↵</Kbd> run</span><span><Kbd>esc</Kbd> close</span></div>
    </dialog>
  )
}
