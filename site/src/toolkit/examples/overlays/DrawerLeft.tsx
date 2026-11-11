import { state } from '@kerf/core'
import { Button, Drawer, Text } from '@kerf/veneer'

export function DrawerLeft() {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Left
      </Button>
      <Drawer
        open={open}
        side="left"
        title="Projects"
      >
        <Text subtle>For navigation.</Text>
      </Drawer>
    </>
  )
}
