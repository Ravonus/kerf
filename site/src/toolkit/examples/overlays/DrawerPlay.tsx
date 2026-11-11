import { state } from '@kerf/core'
import { Button, Drawer, Text } from '@kerf/veneer'

export function DrawerPlay(p: {
  side: 'auto' | 'right' | 'left' | 'top' | 'bottom'
}) {
  const open = state(false)
  return (
    <>
      <Button
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = true)}
      >
        Open the drawer
      </Button>
      <Drawer
        open={open}
        side={p.side}
        title="Deploy d-4821"
        description="storefront, on main"
      >
        <Text subtle>
          Cache product images at the edge.
        </Text>
      </Drawer>
    </>
  )
}
