// Empty and error state messages for a table.
import { derived, type Resource, type State } from '@weft-js/core'
import type { TableProps, TableStatus } from './Table-types'

const isResource = (r: unknown): r is Resource<unknown> =>
  typeof (r as Resource<unknown> | null | undefined)?.refresh === 'function'

/** Create the notice text and actions under the table's owner. */
export function tableNotice<T>(
  rows: () => TableProps<T>['rows'],
  error: () => TableProps<T>['error'],
  empty: () => TableProps<T>['empty'],
  onRetry: () => TableProps<T>['onRetry'],
  phase: { readonly value: TableStatus },
  typed: State<string>,
) {
  const retry = () => {
    onRetry()?.()
    if (isResource(rows())) (rows() as Resource<unknown>).refresh()
  }
  const clear = () => (typed.value = '')
  const noticeTitle = derived(() =>
    phase.value === 'error'
      ? (error()?.title ?? 'This couldn’t load')
      : typed.value
        ? `No rows match “${typed.value}”`
        : (empty()?.title ?? 'Nothing here yet'),
  )
  const noticeText = derived(() => {
    if (phase.value === 'error') {
      return (
        error()?.text ??
        (isResource(rows()) && (rows() as Resource<unknown>).error instanceof Error
          ? ((rows() as Resource<unknown>).error as Error).message
          : 'Try again in a moment.')
      )
    }
    return typed.value ? 'Try a shorter term, or clear the filter.' : empty()?.text
  })

  return { retry, clear, noticeTitle, noticeText }
}
