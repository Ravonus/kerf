import { state } from '@kerf-js/core'

import { bar } from '@kerf-js/veneer-core/charts'

import { Button, Chart } from '@kerf-js/veneer'

import { DEPLOYS_BY_TEAM } from '../../world'

import { TEAMS } from './shared-dollars'

export function ChartRetry() {
  const status = state<'error' | 'loading' | undefined>(
    'error',
  )
  const retry = () => {
    status.value = 'loading'
    setTimeout(() => (status.value = undefined), 900)
  }
  return (
    <Chart
      form={bar}
      title="deploys"
      state={status.value}
      error={{
        title: 'Couldn’t load deploys',
        detail: 'The metrics service timed out.',
      }}
      action={
        <Button
          emphasis="outline"
          onClick={retry}
        >
          Retry
        </Button>
      }
      data={DEPLOYS_BY_TEAM}
      x="quarter"
      xName="Quarter"
      series={TEAMS}
    />
  )
}
