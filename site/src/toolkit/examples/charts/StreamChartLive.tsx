import { state } from '@weft-js/core'

import { interval } from '@weft-js/core/browser'

import { StreamChart } from '@weft-js/warp'

import { seed, SPIKE, STREAM_TICKS } from './shared-dollars'

import { REGIONS as _REGIONS } from '../../world'

export function StreamChartLive() {
  const data = state(seed)
  let t = 60
  interval(1000, () => {
    t++
    data.value = [...data.value.slice(1), Math.round(52 + Math.sin(t / 5) * 14 + (t % 4))]
  })
  return (
    <StreamChart
      title="Requests per second"
      description="storefront, updates every second"
      data={data.value}
      domain={[20, 90]}
      ticks={STREAM_TICKS}
      reference={SPIKE}
      unit="requests per second"
      span="−60 s"
    />
  )
}
