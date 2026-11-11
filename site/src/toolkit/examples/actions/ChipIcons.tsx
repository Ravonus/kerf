import { state } from '@kerf/core'
import { Chip, Row } from '@kerf/veneer'

export function ChipIcons() {
  const mine = state(true)
  const starred = state(false)
  return (
    <Row gap="tight">
      <Chip
        icon="user"
        pressed={mine.value}
        onClick={() => (mine.value = !mine.value)}
      >
        Mine
      </Chip>
      <Chip
        icon="star"
        pressed={starred.value}
        onClick={() => (starred.value = !starred.value)}
      >
        Starred
      </Chip>
    </Row>
  )
}
