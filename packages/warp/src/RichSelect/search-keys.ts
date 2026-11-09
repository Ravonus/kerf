import type { ChangeReason } from '@weft-js/warp-core'
import { listKey } from '@weft-js/warp-core'
import { flush, type State } from '@weft-js/core'
import type { Row } from './list'

export function searchKeys({
  shown,
  active,
  onPick,
  show,
}: {
  shown: { readonly value: Row[] }
  active: State<number>
  onPick: () => (key: string, reason: ChangeReason) => void
  show: () => void
}) {
  return (e: KeyboardEvent) => {
    const n = shown.value.length
    if (!n) return
    const m = listKey(e.key, active.value, n, { page: 8, wrap: true, typing: true })
    if (!m.handled) return
    e.preventDefault()
    if (m.pick) return onPick()(shown.value[active.value]!.key, 'keyboard')
    active.value = m.to
    flush()
    show()
  }
}
