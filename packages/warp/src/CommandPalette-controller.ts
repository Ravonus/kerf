// Per-instance palette state, search and keyboard navigation.
import { dialog, listKey, moveShuttle, paletteHotkey, rankCommands, uid } from '@weft-js/warp-core'
import { derived, flush, state, untrack, watch } from '@weft-js/core'
import { bindable } from './bind'
import { use } from '@weft-js/warp-core/weft'
import { arrange, paint, type Row } from './CommandPalette-rows'
import type { Command, CommandPaletteProps } from './CommandPalette'

type PaletteRefs = {
  face?: HTMLElement | undefined
  el?: HTMLDialogElement | undefined
  input?: HTMLInputElement | undefined
  list?: HTMLDivElement | undefined
}

function paletteState(props: CommandPaletteProps) {
  const refs: PaletteRefs = {}
  const id = uid('pal')
  const flag = bindable<boolean>(
    () => props.open,
    () => props.defaultOpen,
    false,
    () => (o) => props.onOpenChange?.(o),
  )
  const typed = state('')
  const active = state(0)
  const rows = state<Row[]>([])
  const size = state(0)
  const drill = state<Command[] | undefined>(undefined)
  // the open level's name: its row's `title`, or its label without a trailing "…"
  const crumb = state('')
  const mode = derived(() => props.modes?.find((m) => typed.value.startsWith(m.prefix)))
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
  return { refs, id, flag, typed, active, rows, size, drill, crumb, mode, items, pending, result }
}

function paletteSearch(props: CommandPaletteProps, model: ReturnType<typeof paletteState>) {
  const { refs, size, rows, drill, active, pending } = model
  let query: AbortController | undefined
  let shown: Command[] = []
  const show = (next: Command[], q: string) => {
    shown = next
    const arranged = arrange(next, props.groupOrder)
    if (arranged.length > untrack(() => size.value)) size.value = arranged.length
    rows.value = arranged
    flush()
    paint(refs.list, q, arranged)
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
    const m = props.modes?.find((x) => value.startsWith(x.prefix))
    const q = m ? value.slice(m.prefix.length) : value
    const statics = m ? (m.commands ?? []) : (props.commands ?? [])
    let now = rank(statics, q)
    const late: Promise<Command[]>[] = []
    for (const source of (m ? m.sources : props.sources) ?? []) {
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
  return answer
}

function paletteNavigation(
  props: CommandPaletteProps,
  model: ReturnType<typeof paletteState>,
  answer: (value: string) => void,
) {
  const { refs, typed, crumb, drill, items, flag, active } = model
  // entering or leaving a level starts its search afresh: what was typed found the row, it isn't a search of its rows
  const clear = () => {
    if (refs.input) refs.input.value = ''
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
    refs.input?.focus()
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
      props.onRun?.(c, reason)
    })
  }
  const move = (to: number) => {
    active.value = to
    flush()
    refs.el?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  }
  return { clear, down, up, run, move }
}

function paletteKey(
  model: ReturnType<typeof paletteState>,
  navigation: ReturnType<typeof paletteNavigation>,
  back: () => boolean,
) {
  const { items, active, rows, refs, drill } = model
  const { move, down, up, run } = navigation
  return (e: KeyboardEvent) => {
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
      refs.input &&
      refs.input.selectionStart === refs.input.value.length &&
      items.value[at]?.children
    ) {
      e.preventDefault()
      return down(items.value[at])
    }
    if (e.key === 'ArrowLeft' && drill.value && !refs.input?.selectionStart) {
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
}

function paletteShuttle(model: ReturnType<typeof paletteState>) {
  const { refs, active, rows, flag } = model
  // one highlight that travels (redesign §3): it reads the row after the render that moved it
  watch(
    () => [active.value, rows.value, flag.value] as const,
    ([, , on]) => {
      requestAnimationFrame(() => {
        if (!refs.face) return
        if (!on) {
          refs.face.setAttribute('data-instant', '')
          refs.face.style.removeProperty('--warp-a')
          return
        }
        // the row, not its option: while a row's entrance runs, its translate makes it the option's offsetParent
        const row = refs.list?.querySelector<HTMLElement>('[aria-selected="true"]')?.parentElement
        if (row) moveShuttle(refs.face, row.offsetTop, row.offsetTop + row.offsetHeight)
        requestAnimationFrame(() => refs.face?.removeAttribute('data-instant'))
      })
    },
  )
}

/** Creates the palette state and event handlers. */
export function paletteController(props: CommandPaletteProps) {
  const model = paletteState(props)
  const { refs, id, flag, typed, active, rows, size, drill, crumb, mode, items, pending, result } =
    model
  // Esc steps back before it closes: a query clears first, then an empty nested level goes up one, then the palette
  // closes. The dialog's layer asks this first, so the step holds whether the key reached the input or the dialog.
  const back = () => {
    if (refs.input?.value) {
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
    () => refs.el,
    () => ({ open: flag.value, onClose: () => flag.set(false), onEscape: back }),
  )
  if (untrack(() => (props.hotkey === undefined ? 'k' : props.hotkey)) !== false)
    use(
      paletteHotkey,
      () => refs.el,
      () => ({
        key: String(props.hotkey === undefined ? 'k' : props.hotkey),
        slash: props.slash,
        onPress: () => flag.set(!untrack(() => flag.value)),
      }),
    )

  const answer = paletteSearch(props, model)
  watch(
    () => flag.value,
    (on) => {
      if (!on) return
      typed.value = ''
      drill.value = undefined
      crumb.value = ''
      active.value = 0
      if (refs.input) refs.input.value = ''
      answer('')
    },
  )
  const navigation = paletteNavigation(props, model, answer)
  const { clear, up, run } = navigation
  const onKey = paletteKey(model, navigation, back)
  const onInput = (e: Event & { currentTarget: HTMLInputElement }) => {
    typed.value = e.currentTarget.value
    answer(e.currentTarget.value)
  }
  const slots = derived(() => Array.from({ length: size.value }, (_, i) => i))
  paletteShuttle(model)
  return {
    refs,
    id,
    flag,
    typed,
    active,
    rows,
    crumb,
    mode,
    items,
    pending,
    result,
    slots,
    up,
    onInput,
    onKey,
    run,
  }
}
