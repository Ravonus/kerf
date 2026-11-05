import { state, untrack } from '@weft-js/core'
import { PaginationBar } from '@weft-js/warp'

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
