import { state } from '@kerf/core'
import { PaginationBar } from '@kerf/veneer'

export function PaginationBarCursor() {
  const index = state(0)
  return (
    <PaginationBar
      label="Audit log"
      mode="cursor"
      size={50}
      pageIndex={index.value}
      hasPrev={index.value > 0}
      hasMore={index.value < 3}
      onPageChange={(i) => (index.value = i)}
    />
  )
}
