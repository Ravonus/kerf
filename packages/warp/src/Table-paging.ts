// Paging and count views for a table.
import { derived, type State, type Resource } from '@weft-js/core'
import type { TableProps } from './Table-types'
import type { tableSource } from './Table-source'

const isResource = (r: unknown): r is Resource<unknown> =>
  typeof (r as Resource<unknown> | null | undefined)?.refresh === 'function'

/** Create paging and count state under the table's owner. */
export function tablePaging<T>(
  rows: () => TableProps<T>['rows'],
  page: () => TableProps<T>['page'],
  onPageChange: () => TableProps<T>['onPageChange'],
  source: ReturnType<typeof tableSource<T>>,
  at: State<number>,
) {
  const { remote, list, envelope, shown, paged, visible, phase } = source
  const go = (reason: 'next' | 'prev') => {
    if (remote.value)
      return onPageChange()?.(
        reason === 'next' ? envelope.value?.next : envelope.value?.prev,
        reason,
      )
    at.value = paged.value!.page + (reason === 'next' ? 1 : -1)
    onPageChange()?.(at.value, reason)
  }
  const hasPrev = derived(
    () =>
      phase.value === 'ready' &&
      (remote.value ? envelope.value?.prev != null : (paged.value?.page ?? 0) > 0),
  )
  const hasNext = derived(
    () =>
      phase.value === 'ready' &&
      (remote.value
        ? envelope.value?.next != null
        : !!paged.value && paged.value.page < paged.value.pages - 1),
  )
  const range = derived(() => {
    if (phase.value !== 'ready') return ''
    const p = paged.value
    if (p) return `${p.from}–${p.to} of ${shown.value.length}`
    const total = envelope.value?.total
    return total === undefined ? '' : `${visible.value.length} of ${total}`
  })
  const count = derived(() =>
    phase.value === 'ready' && !remote.value ? `${shown.value.length} of ${list.value.length}` : '',
  )
  const footer = derived(() => page() !== undefined || isResource(rows()))

  return { go, hasPrev, hasNext, range, count, footer }
}
