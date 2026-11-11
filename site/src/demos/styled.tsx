import { state } from '@kerf-js/core'
import { Card, Switch } from '@kerf-js/veneer'

export default function Banner() {
  const urgent = state(false)
  return (
    <Card title="A banner">
      <Switch
        checked={urgent.value}
        onChange={(
          e: Event & { currentTarget: HTMLInputElement },
        ) => (urgent.value = e.currentTarget.checked)}
      >
        Urgent
      </Switch>
      <p
        class={urgent.value ? 'banner urgent' : 'banner'}
        style={{
          padding: 12,
          borderRadius: 8,
          background: urgent.value
            ? 'crimson'
            : 'transparent',
          color: urgent.value ? 'white' : undefined,
        }}
      >
        {urgent.value
          ? 'Deploys are paused.'
          : 'All systems normal.'}
      </p>
    </Card>
  )
}
