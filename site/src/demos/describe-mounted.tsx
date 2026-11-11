import { state } from '@kerf-js/core'
import { Card, Switch } from '@kerf-js/veneer'

export default function TwoWays() {
  const open = state(true)
  return (
    <Card title="Hide or remove">
      <Switch
        checked={open.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (open.value = e.currentTarget.checked)}
      >
        Show both notes
      </Switch>
      {/* Removed: when `open` turns false these nodes
          are thrown away, then made new when true. */}
      {open.value && (
        <input
          aria-label="Removed when hidden"
          placeholder="Type here, then hide"
        />
      )}
      {/* Hidden: the same nodes stay in the page,
          so what you typed stays too. */}
      <input
        aria-label="Kept when hidden"
        placeholder="And here"
        hidden={!open.value}
      />
    </Card>
  )
}
