import { state } from '@kerf-js/core'
import { PaginationBar } from '@kerf-js/veneer'

export function PaginationBarNarrow() {
  const page = state(4)
  const size = state(25)
  return (
    <PaginationBar
      label="Deploys"
      page={page}
      size={size}
      total={2480}
    />
  )
}
