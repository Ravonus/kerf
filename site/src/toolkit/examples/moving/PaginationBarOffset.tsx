import { state } from '@kerf/core'
import { PaginationBar } from '@kerf/veneer'

export function PaginationBarOffset() {
  const page = state(6)
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
