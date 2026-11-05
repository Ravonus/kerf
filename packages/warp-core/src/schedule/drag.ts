import { CalendarDragAction } from './drag-action'
import type { Slot } from './dates'

/** The slot under a drag, and what kind of drag it is. */
export type DragPreview = Slot & {
  mode: 'move' | 'resize' | 'create'
  id?: string | undefined
  origin?: Slot | undefined
}

/** Options for dragging events and slots on the calendar. */
export interface CalendarDragOptions {
  /** `x` for a timeline: lanes, with time running across and `from`..`to` minutes on it. */
  axis?: 'x' | 'y'
  from?: number | undefined
  to?: number | undefined
  step?: number
  readOnly?: boolean | undefined
  /** The event's slot; `null` for one that can't be dragged (locked). */
  slot(id: string): Slot | null
  onPreview(p: DragPreview | null): void
  onDrop(p: DragPreview): void
  onPress(id: string, el: HTMLElement): void
  onLongPress?: ((id: string, el: HTMLElement) => void) | undefined
  /** A double-click on an empty slot. */
  onSlot?(date: string, minute: number, resource?: string): void
}

export const LONG_PRESS = 400

/**
 * Pointer gestures on a time grid (07 §2.2): past a 4px threshold an event moves, its bottom handle resizes, and empty
 * slots draw a draft, all snapped to `step` (Alt for 5) and cancelled by Escape. Nothing is captured until the
 * threshold, so a press stays a click on the event. A touch never drags: a long press lifts, a swipe scrolls.
 * `[data-part="col"]` carries `data-date`, a lane `data-resource`, and an event `data-id`.
 */
export function calendarDrag(el: HTMLElement, opts: CalendarDragOptions) {
  const action = new CalendarDragAction(el, opts, LONG_PRESS)
  return {
    update(next: CalendarDragOptions) {
      action.update(next)
    },
    destroy() {
      action.destroy()
    },
  }
}
