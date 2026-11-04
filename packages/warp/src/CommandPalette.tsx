import { SearchIcon } from '@weft-js/warp-icons'
import { dialog, listKey, moveShuttle, paletteHotkey, rankCommands, uid } from '@weft-js/warp-core'
import { derived, effect, flush, state, untrack, watch } from '@weft-js/core'
import { bindable, type Openable } from './bind'
import { Icon, type IconRef } from './Icon'
import { Kbd } from './Kbd'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/dialog.css'
import '@weft-js/warp-core/styles/components/menu.css'
import '@weft-js/warp-core/styles/components/command-palette.css'
import '@weft-js/warp-core/styles/components/palette-motion.css'

/** One entry the palette can run or drill into. */
export interface Command {
  /** Stable key for the row; the label is used when it is left out. */
  id?: string
  /** The row's words, searched by fuzzy letters. */
  label: string
  /** Rows gather under their group's heading. */
  group?: string
  /** A glyph before the label. */
  icon?: IconRef
  /** Keys shown at the row's end, like "⌘N". Shown only: binding the key is the app's. */
  shortcut?: string
  /** Quiet text at the row's end: where it lives, or the words that matched. */
  hint?: string
  /** More words it answers to. */
  keywords?: string[]
  /** Letters of `label` to mark, from `rankCommands`. A source's rows mark what the query matched without it. */
  hits?: number[]
  /** Where it goes. ⌘Enter opens this in a new tab. */
  href?: string
  /** → on the row, or picking a row with no `run`, shows these in the same list. */
  children?: () => Command[]
  /** The name of the list `children` opens ("Region"), shown before the query while you're in it. The label without it. */
  title?: string
  /** What picking the row does. It runs after the palette has closed, so what it opens takes focus. */
  run?: () => void
}

/**
 * Results for a query. Return an array to answer in the same frame; return a promise and its rows land below what's
 * showing, without moving the active row. The signal aborts when the query has changed.
 */
export type CommandSource = (query: string, signal: AbortSignal) => Command[] | Promise<Command[]>

/** What a first character changes to: `>` for commands, `@` for one kind of thing. */
export interface CommandMode {
  /** The first characters that switch to this mode, like ">" or "@". */
  prefix: string
  /** The mode's name, shown in the input row while it is on. */
  label: string
  /** The input's placeholder while the mode is on. */
  placeholder?: string
  /** The rows searched in this mode, in place of the palette's `commands`. */
  commands?: Command[]
  /** Searched as you type in this mode, after its `commands`. */
  sources?: CommandSource[]
}

/** Props for CommandPalette. */
export type CommandPaletteProps = Openable & {
  /** The rows searched as you type, grouped by their `group`. */
  commands?: Command[]
  /** Searched as you type, after `commands`. */
  sources?: CommandSource[]
  /** Prefixes that switch what is searched: `>` for commands, `@` for people. */
  modes?: CommandMode[]
  /** The order groups show in, whatever order rows arrive. Groups not named follow. */
  groupOrder?: string[]
  /** Hears every command run, however it was picked. */
  onRun?: (command: Command, reason: 'pointer' | 'keyboard') => void
  /** The dialog's accessible name, and the input's label. */
  label?: string
  /** The input's placeholder when no mode is on. */
  placeholder?: string
  /** The key that opens it with ⌘ or Ctrl. `false` leaves opening to the app. */
  hotkey?: string | false
  /** `/` opens it too, outside a field. */
  slash?: boolean | undefined
}

type Row =
  | { head: string; item?: undefined; at?: undefined }
  | { head?: undefined; item: Command; at: number }

const HIT = 'warp-palette-hit'

/** Rows for groups in `order`, numbered in the order the arrows walk them. */
function arrange(commands: Command[], order: readonly string[] = []) {
  const groups = new Map<string, Command[]>()
  for (const c of commands) {
    const name = c.group ?? ''
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name)!.push(c)
  }
  const rank = (n: string) => {
    const i = order.indexOf(n)
    return i < 0 ? order.length : i
  }
  const rows: Row[] = []
  let at = 0
  for (const [name, list] of [...groups].sort((a, b) => rank(a[0]) - rank(b[0]))) {
    if (name) rows.push({ head: name })
    for (const item of list) rows.push({ item, at: at++ })
  }
  return rows
}

/** Marks where `words` start in the rows' text, through the CSS Custom Highlight API: no markup, no row is rebuilt. */
function paint(list: HTMLElement | undefined, query: string, rows: readonly Row[]) {
  const win = list?.ownerDocument.defaultView
  if (!win?.CSS?.highlights || typeof win.Highlight !== 'function') return
  const ranges: Range[] = []
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const mark = (node: Text | null | undefined, indices: number[]) => {
    for (const i of indices) {
      if (!node || i >= node.length) continue
      const r = new win.Range()
      r.setStart(node, i)
      r.setEnd(node, i + 1)
      ranges.push(r)
    }
  }
  rows.forEach((row, n) => {
    if (!row.item) return
    const el = list!.querySelectorAll(':scope > [data-part="row"]')[n]
    const label = el?.querySelector('[data-part="text"]')?.firstChild as Text | null
    const hint = el?.querySelector('[data-part="hint"]')?.firstChild as Text | null
    if (row.item.hits) return mark(label, row.item.hits)
    for (const node of [label, hint]) {
      const text = node?.data.toLowerCase() ?? ''
      for (const w of words) {
        const i = text.indexOf(w)
        if (i >= 0)
          mark(
            node,
            Array.from({ length: w.length }, (_, k) => i + k),
          )
      }
    }
  })
  win.CSS.highlights.set(HIT, new win.Highlight(...ranges))
}

/** Writes `value` only if it differs, and hides the node when there is nothing to show. */
const put = (el: HTMLElement, value: string | undefined) => {
  el.hidden = !value
  if (value && el.textContent !== value) el.textContent = value
}

/** One row of the pool. Everything but the active mark is one write pass per change of row, so a list costs little to open. */
function Slot({
  row,
  id,
  active,
  onPick,
  onHover,
}: {
  row: () => Row | undefined
  id: string
  active: () => number
  onPick: (at: number) => void
  onHover: (at: number) => void
}) {
  const r = derived(() => row())
  const at = () => untrack(() => r.value?.at ?? -1)
  let box!: HTMLElement,
    head!: HTMLElement,
    option!: HTMLElement,
    text!: HTMLElement,
    hint!: HTMLElement,
    keys!: HTMLElement
  const view = (
    <div ref={(n) => (box = n)} data-part="row" role="presentation" hidden="">
      <div ref={(n) => (head = n)} data-part="group-label" role="presentation" hidden=""></div>
      <div
        ref={(n) => (option = n)}
        data-part="item"
        hidden=""
        aria-selected={r.value?.item ? (r.value.at === active() ? 'true' : 'false') : undefined}
        onPointerMove={() => {
          if (at() !== active()) onHover(at())
        }}
        onClick={() => onPick(at())}
      >
        {r.value?.item?.icon && <Icon name={r.value?.item?.icon} />}
        <span ref={(n) => (text = n)} data-part="text"></span>
        <span ref={(n) => (hint = n)} data-part="hint" hidden=""></span>
        <span ref={(n) => (keys = n)} data-part="shortcut" hidden=""></span>
      </div>
    </div>
  )
  effect(
    () => r.value,
    (v) => {
      const item = v?.item
      box.hidden = !v
      put(head, v?.head)
      option.hidden = !item
      if (item) {
        option.setAttribute('role', 'option')
        option.id = `${id}-${v.at}`
      } else {
        option.removeAttribute('role')
        option.removeAttribute('id')
      }
      text.textContent = item?.label ?? ''
      put(hint, item?.hint)
      put(keys, item?.shortcut)
    },
  )
  return view
}

/**
 * The command palette (05 §3; components.html:1109-1113, 1704-1754): an APG combobox in a modal <dialog>. Focus stays in
 * the input. ↑/↓, Home/End and PageUp/PageDown move the active row, Tab goes to the next group, → opens a row's `children`,
 * Enter runs it, ⌘Enter opens its `href` in a new tab. Esc clears the query, then closes and returns focus. A nested level
 * opens and closes (← at the query's start, or Esc once it is empty) with an empty query, and typing there filters its rows.
 *
 * Rows are a pool that only grows: a key press writes text into nodes that already exist, so a query never builds a row
 * and nothing shifts. Matches are painted with the Custom Highlight API. Rows appear only while it's open, so a closed
 * palette costs a page one empty dialog.
 */
export function CommandPalette({
  open,
  defaultOpen,
  onOpenChange,
  commands,
  sources,
  modes,
  groupOrder,
  onRun,
  label = 'Command palette',
  placeholder = 'Search or run a command…',
  hotkey = 'k',
  slash,
}: CommandPaletteProps) {
  const id = uid('pal')
  const flag = bindable<boolean>(
    () => open,
    () => defaultOpen,
    false,
    () => (o) => onOpenChange?.(o),
  )
  const typed = state('')
  const active = state(0)
  let face: HTMLElement | undefined
  const rows = state<Row[]>([])
  const size = state(0)
  const drill = state<Command[] | undefined>(undefined)
  // the open level's name: its row's `title`, or its label without a trailing "…"
  const crumb = state('')
  const mode = derived(() => modes?.find((m) => typed.value.startsWith(m.prefix)))
  const items = derived(() => rows.value.flatMap((r) => (r.item ? [r.item] : [])))
  const pending = state(false)
  const result = derived(() => {
    const n = items.value.length
    return !flag.value
      ? ''
      : n
        ? `${n} ${n === 1 ? 'command' : 'commands'}`
        : pending.value
          ? ''
          : 'No results'
  })
  let el: HTMLDialogElement | undefined
  let input: HTMLInputElement | undefined
  let list: HTMLDivElement | undefined
  let query: AbortController | undefined
  let shown: Command[] = []
  // Esc steps back before it closes: a query clears first, then an empty nested level goes up one, then the palette
  // closes. The dialog's layer asks this first, so the step holds whether the key reached the input or the dialog.
  const back = () => {
    if (input?.value) {
      clear()
      answer('')
      return true
    }
    if (untrack(() => drill.value)) {
      up()
      return true
    }
    return false
  }
  use(
    dialog,
    () => el,
    () => ({ open: flag.value, onClose: () => flag.set(false), onEscape: back }),
  )
  if (untrack(() => hotkey) !== false)
    use(
      paletteHotkey,
      () => el,
      () => ({ key: String(hotkey), slash, onPress: () => flag.set(!untrack(() => flag.value)) }),
    )

  const show = (next: Command[], q: string) => {
    shown = next
    const arranged = arrange(next, groupOrder)
    if (arranged.length > untrack(() => size.value)) size.value = arranged.length
    rows.value = arranged
    flush()
    paint(list, q, arranged)
  }
  const rank = (cmds: Command[], q: string) =>
    rankCommands(cmds, q).flatMap((g) =>
      g.rows.map((r) => (r.hits.length ? { ...r.item, hits: r.hits } : r.item)),
    )
  const answer = (value: string) => {
    query?.abort()
    const kids = untrack(() => drill.value)
    if (kids) {
      active.value = 0
      pending.value = false
      return show(rank(kids, value), value)
    } // a nested level filters its own rows
    const ctrl = (query = new AbortController())
    const m = modes?.find((x) => value.startsWith(x.prefix))
    const q = m ? value.slice(m.prefix.length) : value
    const statics = m ? (m.commands ?? []) : (commands ?? [])
    let now = rank(statics, q)
    const late: Promise<Command[]>[] = []
    for (const source of (m ? m.sources : sources) ?? []) {
      const got = source(q, ctrl.signal)
      if (Array.isArray(got)) now = now.concat(got)
      else late.push(got)
    }
    active.value = 0
    pending.value = late.length > 0
    show(now, q)
    let left = late.length
    for (const p of late)
      void p.then(
        (more) => {
          if (ctrl.signal.aborted) return
          if (more.length)
            show(
              shown.concat(more.filter((c) => !shown.some((s) => s.href && s.href === c.href))),
              q,
            )
          if (!--left) pending.value = false
        },
        () => {
          if (!ctrl.signal.aborted && !--left) pending.value = false
        },
      )
  }
  watch(
    () => flag.value,
    (on) => {
      if (!on) return
      typed.value = ''
      drill.value = undefined
      crumb.value = ''
      active.value = 0
      if (input) input.value = ''
      answer('')
    },
  )
  // entering or leaving a level starts its search afresh: what was typed found the row, it isn't a search of its rows
  const clear = () => {
    if (input) input.value = ''
    typed.value = ''
  }
  const down = (from: Command) => {
    clear()
    crumb.value = from.title ?? from.label.replace(/\s*(…|\.\.\.)$/, '')
    drill.value = from.children!()
    answer('')
  }
  const up = () => {
    clear()
    drill.value = undefined
    crumb.value = ''
    answer('')
    input?.focus()
  }
  const run = (at: number, reason: 'pointer' | 'keyboard') => {
    const c = items.value[at]
    if (!c) return
    if (!c.run && c.children) return down(c)
    flag.set(false)
    flush()
    // after the dialog has gone, so what the command opens takes focus from the opener
    queueMicrotask(() => {
      c.run?.()
      onRun?.(c, reason)
    })
  }
  const move = (to: number) => {
    active.value = to
    flush()
    el?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return
    if (e.key === 'Escape') {
      if (!e.defaultPrevented && back()) e.preventDefault()
      return
    } // the layer took it first
    const count = items.value.length
    if (!count) return
    const at = active.value
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      return move(e.key === 'Home' ? 0 : count - 1)
    }
    if (e.key === 'Tab') {
      const heads = rows.value.flatMap((r, i) =>
        r.head === undefined ? [] : [rows.value[i + 1]?.at ?? 0],
      )
      if (heads.length < 2) return e.preventDefault()
      e.preventDefault()
      const next = e.shiftKey
        ? ([...heads].reverse().find((h) => h < at) ?? heads.at(-1)!)
        : (heads.find((h) => h > at) ?? heads[0])
      return move(next!)
    }
    if (
      e.key === 'ArrowRight' &&
      input &&
      input.selectionStart === input.value.length &&
      items.value[at]?.children
    ) {
      e.preventDefault()
      return down(items.value[at])
    }
    if (e.key === 'ArrowLeft' && drill.value && !input?.selectionStart) {
      e.preventDefault()
      return up()
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      const href = items.value[at]?.href
      if (href) {
        e.preventDefault()
        window.open(href, '_blank', 'noopener')
      }
      return
    }
    const m = listKey(e.key, at, count, { wrap: true, typing: true, page: 5 })
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return run(at, 'keyboard')
    move(m.to)
  }
  const onInput = (e: Event & { currentTarget: HTMLInputElement }) => {
    typed.value = e.currentTarget.value
    answer(e.currentTarget.value)
  }
  const slots = derived(() => Array.from({ length: size.value }, (_, i) => i))
  // one highlight that travels (redesign §3): it reads the row after the render that moved it
  watch(
    () => [active.value, rows.value, flag.value] as const,
    ([, , on]) => {
      requestAnimationFrame(() => {
        if (!face) return
        if (!on) {
          face.setAttribute('data-instant', '')
          face.style.removeProperty('--warp-a')
          return
        }
        // the row, not its option: while a row's entrance runs, its translate makes it the option's offsetParent
        const row = list?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement
        if (row) moveShuttle(face, row.offsetTop, row.offsetTop + row.offsetHeight)
        requestAnimationFrame(() => face?.removeAttribute('data-instant'))
      })
    },
  )
  return (
    <dialog ref={(n) => (el = n)} data-scope="palette" aria-label={label}>
      <div data-part="input-row" data-sweep="">
        <span data-part="sweep-base" aria-hidden="true"></span>
        <span data-part="sweep" aria-hidden="true"></span>
        <SearchIcon />
        <label for={`${id}-in`} data-part="sr-only">
          {crumb.value ? `${label}, ${crumb.value}` : label}
        </label>
        {crumb.value && (
          <button
            type="button"
            data-part="crumb"
            tabindex="-1"
            aria-label={`Back from ${crumb.value}`}
            onClick={up}
          >
            {crumb.value}
            <span aria-hidden="true">›</span>
          </button>
        )}
        <input
          ref={(n) => (input = n)}
          data-initial=""
          data-part="input"
          id={`${id}-in`}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={items.value.length ? `${id}-${active.value}` : undefined}
          placeholder={
            crumb.value ? `Search ${crumb.value}…` : (mode.value?.placeholder ?? placeholder)
          }
          autocomplete="off"
          spellcheck={false}
          onInput={onInput}
          onKeyDown={onKey}
        />
        {mode.value ? <span data-part="mode">{mode.value.label}</span> : <Kbd>esc</Kbd>}
      </div>
      <div
        ref={(n) => (list = n)}
        data-part="list"
        role="listbox"
        id={`${id}-list`}
        aria-label="Commands"
      >
        <span ref={(n) => (face = n)} data-part="shuttle" aria-hidden="true"></span>
        {slots.value.map((i) => (
          <Slot
            key={i}
            id={id}
            row={() => rows.value[i]}
            active={() => active.value}
            onPick={(at) => run(at, 'pointer')}
            onHover={(at) => (active.value = at)}
          />
        ))}
      </div>
      {flag.value && !items.value.length && !pending.value && (
        <div data-part="empty">{`Nothing matches “${typed.value}”.`}</div>
      )}
      <span data-part="sr-only" role="status">
        {result.value}
      </span>
      <div data-part="footer" aria-hidden="true">
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>tab</Kbd> group
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </dialog>
  )
}
