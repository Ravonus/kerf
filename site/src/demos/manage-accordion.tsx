import { state } from '@kerf/core'
import { Button, Card } from '@kerf/veneer'

function Panel({
  title,
  active,
  onShow,
  children,
}: {
  title: string
  active: boolean
  onShow: () => void
  children?: unknown
}) {
  return (
    <Card title={title}>
      {active ? (
        <p>{children}</p>
      ) : (
        <Button
          size="sm"
          emphasis="ghost"
          onClick={onShow}
        >
          Show
        </Button>
      )}
    </Card>
  )
}

export default function Lisbon() {
  // The parent owns which panel is open, so at most one
  // ever is.
  const open = state(0)
  return (
    <>
      <Panel
        title="About"
        active={open.value === 0}
        onShow={() => (open.value = 0)}
      >
        Lisbon is Portugal's capital, built on seven hills
        above the Tagus estuary.
      </Panel>
      <Panel
        title="Getting around"
        active={open.value === 1}
        onShow={() => (open.value = 1)}
      >
        Old yellow trams climb streets too steep for
        buses.
      </Panel>
    </>
  )
}
