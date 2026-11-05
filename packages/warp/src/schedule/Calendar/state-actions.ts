import { flush } from '@weft-js/core'
import {
  at,
  clock,
  conflicts,
  fmt,
  slotOf,
  slotTimes,
  toZone,
  uid,
  type CalEvent,
  type DragPreview,
  type Slot,
} from '@weft-js/warp-core'
import { confirmSweep } from '../bits'

import type { useBase, useDialogs, useEvents, useFocus } from './state-base'
import type { RecurrenceScope } from '../Calendar'
type Reason = 'pointer' | 'keyboard' | 'touch'

type Base = ReturnType<typeof useBase> &
  ReturnType<typeof useEvents> &
  ReturnType<typeof useFocus> &
  ReturnType<typeof useDialogs>

export function useChange({
  p,
  tz,
  overlay,
  waiting,
  say,
  all,
  env,
  focusEvent,
  nodeOf,
  raw,
  askScope,
}: Base) {
  const settle = (
    e: CalEvent,
    slot: Slot,
    verb: 'move' | 'resize',
    reason: Reason,
    chosen?: RecurrenceScope,
  ) => {
    const from =
      e.tz && tz() && e.tz !== tz()
        ? {
            start: toZone(at(slot.date, slot.s), tz()!, e.tz),
            end: toZone(at(slot.date, slot.e), tz()!, e.tz),
          }
        : slotTimes(slot)
    overlay.value = { ...overlay.value, [e.id]: slot }
    waiting.add(e.id)
    const put = () => {
      waiting.delete(e.id)
    }
    const back = (err: unknown) => {
      put()
      const { [e.id]: _, ...rest } = overlay.value
      overlay.value = rest
      say(
        `Couldn't ${verb} ${e.title}: ${(err as Error | undefined)?.message ?? 'try again'}`,
        true,
      )
    }
    let r: PromiseLike<unknown> | undefined
    try {
      r = (verb === 'move' ? p.onMove : p.onResize)?.(
        e,
        { ...from, resource: slot.resource, scope: chosen },
        reason,
      ) as PromiseLike<unknown> | undefined
    } catch (err) {
      back(err)
      return
    }
    if (r?.then) r.then(put, back)
    else put()
    const hit = conflicts(all.value, e, slot)
    const day = fmt(slot.date, { weekday: 'long' }, env.locale.value)
    say(
      `${verb === 'move' ? `Moved ${e.title} to ${day} ${clock(slot.s, env.locale.value, p.hourCycle)}` : `${e.title} now ends at ${clock(slot.e, env.locale.value, p.hourCycle)}`}${hit.length ? `. Overlaps ${hit.map((x) => x.title).join(', ')}` : ''}`,
    )
    flush()
    focusEvent(e.id)
    confirmSweep(nodeOf(e.id))
  }
  const change = (id: string, slot: Slot, verb: 'move' | 'resize', reason: Reason) => {
    const e = raw(id)
    if (!e) return
    if (!e.recurrence) return settle(e, slot, verb, reason)
    overlay.value = { ...overlay.value, [e.id]: slot }
    askScope(
      verb === 'move' ? 'Move' : 'Change',
      (s) => settle(e, slot, verb, reason, s),
      () => {
        const { [e.id]: _, ...rest } = overlay.value
        overlay.value = rest
      },
    )
  }
  return { settle, change }
}

export function useEditing({
  p,
  draft,
  editing,
  stop,
  anchor,
  popped,
  popOpen,
  raw,
  shown,
  doomed,
  askScope,
  say,
  askDelete,
  sheetFor,
  sheet,
}: Base) {
  const newEvent = (start: string, end: string, resource?: string) => {
    draft.value = {
      event: { id: uid('new'), title: '', start, end, cal: p.calendars?.[0]?.id ?? 1, resource },
      isNew: true,
    }
    editing.value = true
  }
  const openPopover = (id: string, el: HTMLElement) => {
    stop.value = id
    anchor.value = el
    popped.value = id
    popOpen.value = true
    const e = raw(id)
    if (e) p.onOpen?.(e)
  }
  const edit = (e: CalEvent) => {
    draft.value = { event: shown(e.id) ?? e, isNew: false }
    editing.value = true
  }
  const remove = (e: CalEvent) => {
    doomed.value = e
    if (e.recurrence)
      return askScope('Delete', (s) => {
        p.onDelete?.(e, s)
        say(`Deleted ${e.title}`)
      })
    askDelete.value = true
  }
  const openSheet = (id: string) => {
    const e = shown(id)
    if (e && !e.locked) {
      sheetFor.value = e
      sheet.value = true
    }
  }
  return { newEvent, openPopover, edit, remove, openSheet }
}

export function useDrag(
  { p, shown, drag, date }: Base,
  { change }: ReturnType<typeof useChange>,
  { newEvent, openPopover, openSheet }: ReturnType<typeof useEditing>,
) {
  const dragOpts = () => ({
    step: p.snap ?? 15,
    readOnly: p.readOnly,
    slot: (id: string) => {
      const e = shown(id)
      return e && !e.locked ? slotOf(e) : null
    },
    onPreview: (v: DragPreview | null) => (drag.value = v),
    onDrop: (v: DragPreview) => {
      if (v.mode === 'create') return newEvent(at(v.date, v.s), at(v.date, v.e), v.resource)
      change(
        v.id!,
        { date: v.date, s: v.s, e: v.e, resource: v.resource },
        v.mode === 'move' ? 'move' : 'resize',
        'pointer',
      )
    },
    onPress: openPopover,
    onLongPress: p.readOnly ? undefined : openSheet,
    onSlot: (d: string, m: number, r?: string) =>
      newEvent(at(d || date.value, m), at(d || date.value, m + 30), r),
  })
  return dragOpts
}
