import { clockRange, fmt, moveKey, slotOf } from '@weft-js/warp-core'

import type { useChange, useEditing } from './state-actions'
import type { useBase, useDialogs, useEvents, useFocus } from './state-base'
type Base = ReturnType<typeof useBase> &
  ReturnType<typeof useEvents> &
  ReturnType<typeof useFocus> &
  ReturnType<typeof useDialogs>
type Change = ReturnType<typeof useChange>
type Editing = ReturnType<typeof useEditing>
type Options = {
  days?: string[]
  resources?: string[]
  next: (key: string, id: string) => string | null
}

function movingKey({
  e,
  opts,
  id,
  rtl,
  m,
  base: { p, moving, say, focusEvent, env },
  actions: { change },
}: {
  e: KeyboardEvent
  opts: Options
  id: string
  rtl: boolean
  m: NonNullable<Base['moving']['value']>
  base: Base
  actions: Change
}) {
  if (e.key === 'Tab') {
    moving.value = null
    return
  }
  const to = moveKey(e.key, e.shiftKey, m.slot, {
    step: p.snap ?? 15,
    days: opts.days,
    rtl,
    resources: opts.resources,
  })
  if (to === null) return
  e.preventDefault()
  if (to === 'cancel') {
    moving.value = null
    say('Move cancelled')
    focusEvent(id)
    return
  }
  if (to === 'drop') {
    const changed = m.slot
    moving.value = null
    if (
      changed.date === m.origin.date &&
      changed.s === m.origin.s &&
      changed.e === m.origin.e &&
      changed.resource === m.origin.resource
    )
      return focusEvent(id)
    return change(
      id,
      changed,
      changed.e - changed.s === m.origin.e - m.origin.s ? 'move' : 'resize',
      'keyboard',
    )
  }
  moving.value = { ...m, slot: to }
  say(
    `${fmt(to.date, { weekday: 'short' }, env.locale.value)} ${clockRange(to.s, to.e, env.locale.value, p.hourCycle)}`,
  )
  focusEvent(id)
}

export function useKeys(base: Base, actions: Change, editing: Editing) {
  const { p, moving, say, focusEvent, raw, shown } = base
  const { change } = actions
  const { openPopover, remove } = editing
  return (e: KeyboardEvent, opts: Options) => {
    const el = (e.target as Element).closest?.<HTMLElement>('[data-id]')
    if (!el) return
    const id = el.dataset.id!
    const rtl = getComputedStyle(el).direction === 'rtl'
    const m = moving.value
    if (m && m.id === id) return movingKey({ e, opts, id, rtl, m, base, actions })
    const ev = shown(id)
    if (!ev) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openPopover(id, el)
      return
    }
    const editable = !p.readOnly && !ev.locked
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && editable && !ev.allDay) {
      e.preventDefault()
      const slot = slotOf(ev)
      moving.value = { id, origin: slot, slot }
      say(
        `Moving ${ev.title}. Arrows move by ${p.snap ?? 15} minutes or a day, Shift with arrows resizes, Enter drops, Escape cancels.`,
        true,
      )
      return
    }
    if (
      e.shiftKey &&
      (e.key === 'ArrowUp' || e.key === 'ArrowDown') &&
      editable &&
      !ev.allDay &&
      !opts.resources
    ) {
      e.preventDefault()
      const to = moveKey(e.key, true, slotOf(ev), { step: p.snap ?? 15 })
      if (to && typeof to === 'object') change(id, to, 'resize', 'keyboard')
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && editable && p.onDelete) {
      e.preventDefault()
      remove(raw(id)!)
      return
    }
    const to = opts.next(e.key, id)
    if (to) {
      e.preventDefault()
      focusEvent(to)
    }
  }
}
