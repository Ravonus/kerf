import { announce, type IsoDate } from '@weft-js/warp-core'
import { flush, type State } from '@weft-js/core'
import { confirmSweep } from './bits'
import type { BookingCalendarProps } from './BookingCalendar'

export function bookingActions(
  p: () => BookingCalendarProps,
  own: State<IsoDate | null>,
  date: { readonly value: IsoDate | null },
  pick: State<number | null>,
  manual: State<boolean>,
  stage: State<'pick' | 'confirm' | 'done'>,
  busy: State<boolean>,
  failed: State<string | null>,
  len: { readonly value: number },
  chosen: { readonly value: number | null },
  when: { readonly value: string },
  root: () => HTMLDivElement | undefined,
) {
  const setDate = (d: IsoDate) => {
    if (p().date && typeof p().date === 'object') (p().date as State<IsoDate | null>).value = d
    else own.value = d
    p().onDateChange?.(d)
    pick.value = null
    stage.value = 'pick'
  }
  const toConfirm = () => {
    stage.value = 'confirm'
    flush()
    root()?.querySelector<HTMLElement>('[data-confirm-step] button:last-child')?.focus()
  }
  const book = async () => {
    const d = date.value,
      s = chosen.value
    if (!d || s === null || busy.value) return
    busy.value = true
    failed.value = null
    try {
      await p().onBook({ date: d, s, e: s + len.value, manual: manual.value })
      stage.value = 'done'
      flush()
      if (root()) {
        confirmSweep(root()!.querySelector('[data-part="slot"][aria-pressed="true"]'))
        announce(root()!.ownerDocument, `Booked ${when.value}`)
      }
    } catch (err) {
      failed.value = (err as Error | undefined)?.message ?? 'That time was just taken.'
      if (root()) announce(root()!.ownerDocument, `Couldn't book: ${failed.value}`, true)
    } finally {
      busy.value = false
    }
  }
  return { setDate, toConfirm, book }
}

export function bookingSlots() {
  return (e: KeyboardEvent) => {
    const d = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[e.key]
    const on = [
      ...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
        'button:not(:disabled)',
      ),
    ]
    const i = on.indexOf(e.target as HTMLButtonElement)
    if (d && i >= 0) {
      e.preventDefault()
      on[(i + d + on.length) % on.length]!.focus()
    }
  }
}
