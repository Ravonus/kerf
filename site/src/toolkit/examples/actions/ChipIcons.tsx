import { state } from '@weft-js/core'
import { Chip, Row } from '@weft-js/warp'

export function ChipIcons() {
  const mine = state(true)
  const starred = state(false)
  return (
    <Row gap="tight">
      <Chip icon="user" pressed={mine.value} onClick={() => (mine.value = !mine.value)}>
        Mine
      </Chip>
      <Chip icon="star" pressed={starred.value} onClick={() => (starred.value = !starred.value)}>
        Starred
      </Chip>
    </Row>
  )
}
