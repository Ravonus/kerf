import { state } from '@weft-js/core'
import { Button, Drawer, Text } from '@weft-js/warp'

export function DrawerSides() {
  const left = state(false)
  const right = state(false)
  const bottom = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (left.value = true)}
      >
        Left
      </Button>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (bottom.value = true)}
      >
        Bottom
      </Button>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (right.value = true)}
      >
        Right
      </Button>
      <Drawer
        open={left}
        side="left"
        title="Left"
      >
        <Text subtle>For navigation.</Text>
      </Drawer>
      <Drawer
        open={bottom}
        side="bottom"
        title="Bottom"
      >
        <Text subtle>
          For a quick task, and on phones.
        </Text>
      </Drawer>
      <Drawer
        open={right}
        side="right"
        title="Right"
      >
        <Text subtle>
          For details of what you pressed.
        </Text>
      </Drawer>
    </>
  )
}
