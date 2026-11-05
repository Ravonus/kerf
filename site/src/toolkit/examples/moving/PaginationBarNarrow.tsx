import { state } from '@weft-js/core'
import { PaginationBar } from '@weft-js/warp'

export function PaginationBarNarrow() {
  const page = state(4)
  const size = state(25)
  return <PaginationBar label="Deploys" page={page} size={size} total={2480} />
}
