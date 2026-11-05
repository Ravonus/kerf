import {
  defineState,
  derived,
  state,
} from '@weft-js/core'
import { Button, Card, Row, Tag } from '@weft-js/warp'

const CITIES = ['Lisbon', 'Oslo', 'Osaka', 'Lima']

// Every change to `pins` is in here. Components only read
// the scope and call its actions.
const board = defineState(
  'learn-board',
  () => {
    const pins = state<string[]>([])
    const count = derived(() => pins.value.length)
    const pin = (city: string) => {
      if (!pins.value.includes(city))
        pins.value = [...pins.value, city]
    }
    const unpin = (city: string) =>
      (pins.value = pins.value.filter((c) => c !== city))
    const clear = () => (pins.value = [])
    return { pins, count, pin, unpin, clear }
  },
  { history: { limit: 50 } },
)

export default function Board() {
  const history = board.$history
  return (
    <Card title={`Pinned: ${board.count.value}`}>
      <Row
        gap="tight"
        wrap
      >
        {CITIES.map((c) => (
          <Button
            key={c}
            size="sm"
            emphasis="soft"
            onClick={() => board.pin(c)}
          >
            {c}
          </Button>
        ))}
      </Row>
      <Row
        gap="tight"
        wrap
      >
        {board.pins.value.map((c) => (
          <Tag
            key={c}
            label={c}
            onRemove={() => board.unpin(c)}
          >
            {c}
          </Tag>
        ))}
      </Row>
      <Row gap="tight">
        <Button
          size="sm"
          emphasis="outline"
          disabled={!history.canUndo.value}
          onClick={() => history.undo()}
        >
          Undo
        </Button>
        <Button
          size="sm"
          emphasis="outline"
          disabled={!history.canRedo.value}
          onClick={() => history.redo()}
        >
          Redo
        </Button>
        <Button
          size="sm"
          emphasis="ghost"
          disabled={board.count.value === 0}
          onClick={() => board.clear()}
        >
          Clear
        </Button>
      </Row>
    </Card>
  )
}
