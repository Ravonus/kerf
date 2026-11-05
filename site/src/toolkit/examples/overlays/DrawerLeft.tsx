import { state } from '@weft-js/core'
import { Button, Drawer, Text } from '@weft-js/warp'

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
