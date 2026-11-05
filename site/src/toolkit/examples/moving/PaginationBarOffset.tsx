import { state } from '@weft-js/core'
import { PaginationBar } from '@weft-js/warp'

export function PaginationBarOffset() {
  const page = state(6)
  const size = state(25)
  return <PaginationBar label="Deploys" page={page} size={size} total={2480} />
}
