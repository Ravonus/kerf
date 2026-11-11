import { state, untrack } from '@kerf-js/core'
import { PaginationBar } from '@kerf-js/veneer'

export function PaginationBarPlay({
  total,
  size: initialSize,
}: {
  total: number
  size: number
}) {
  const page = state(1)
  const size = state(untrack(() => initialSize))
  return (
    <PaginationBar
      label="Projects"
      page={page}
      size={size}
      total={total}
    />
  )
}
