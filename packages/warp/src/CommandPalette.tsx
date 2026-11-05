import { SearchIcon } from '@weft-js/warp-icons'
import { untrack } from '@weft-js/core'
import type { Openable } from './bind'
import type { IconRef } from './Icon'
import { Slot } from './CommandPalette-rows'
import { paletteController } from './CommandPalette-controller'
import { Kbd } from './Kbd'
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

function PaletteInput({
  model,
  label,
  placeholder,
}: {
  model: ReturnType<typeof paletteController>
  label: string
  placeholder: string
}) {
  const { refs, id, crumb, mode, items, active, up, onInput, onKey } = model
  return (
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
        ref={(n) => (refs.input = n)}
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
  )
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
export function CommandPalette(props: CommandPaletteProps) {
  const { label = 'Command palette', placeholder = 'Search or run a command…' } = props
  const model = paletteController(untrack(() => props))
  const { refs, id, flag, typed, active, rows, items, pending, result, slots, run } = model
  return (
    <dialog ref={(n) => (refs.el = n)} data-scope="palette" aria-label={label}>
      <PaletteInput model={model} label={label} placeholder={placeholder} />
      <div
        ref={(n) => (refs.list = n)}
        data-part="list"
        role="listbox"
        id={`${id}-list`}
        aria-label="Commands"
      >
        <span ref={(n) => (refs.face = n)} data-part="shuttle" aria-hidden="true"></span>
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
