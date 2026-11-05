import { state, untrack } from '@weft-js/core'
import { PaginationBar } from '@weft-js/warp'

export function PaginationBarPlay(p: { total: number; size: number }) {
  const page = state(1)
  const size = state(untrack(() => p.size))
  return <PaginationBar label="Projects" page={page} size={size} total={p.total} />
}
