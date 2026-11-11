// Empty and error state messages for a table.
import { derived, type Resource, type State } from '@kerf-js/core'
import type { TableProps, TableStatus } from './Table-types'

const isResource = (r: unknown): r is Resource<unknown> =>
  typeof (r as Resource<unknown> | null | undefined)?.refresh === 'function'

/** Create the notice text and actions under the table's owner. */
export function tableNotice<T>(
  props: TableProps<T>,
  phase: { readonly value: TableStatus },
  typed: State<string>,
) {
  const retry = () => {
    props.onRetry?.()
    if (isResource(props.rows)) (props.rows as Resource<unknown>).refresh()
  }
  const clear = () => (typed.value = '')
  const noticeTitle = derived(() =>
    phase.value === 'error'
      ? (props.error?.title ?? 'This couldn’t load')
      : typed.value
        ? `No rows match “${typed.value}”`
        : (props.empty?.title ?? 'Nothing here yet'),
  )
  const noticeText = derived(() => {
    if (phase.value === 'error') {
      return (
        props.error?.text ??
        (isResource(props.rows) && (props.rows as Resource<unknown>).error instanceof Error
          ? ((props.rows as Resource<unknown>).error as Error).message
          : 'Try again in a moment.')
      )
    }
    return typed.value ? 'Try a shorter term, or clear the filter.' : props.empty?.text
  })

  return [retry, clear, noticeTitle, noticeText] as const
}
