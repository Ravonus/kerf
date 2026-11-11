import { state } from '@kerf/core'

import { BarChart, Segmented } from '@kerf/veneer'

import { COST_BY_SERVICE } from '../../world'

import {
  dollars,
  SERVICES,
  RANGES,
} from './shared-dollars'

export function BarChartRange() {
  const range = state('6')
  return (
    <BarChart
      title="Monthly bill by service"
      data={COST_BY_SERVICE.slice(-Number(range.value))}
      x="month"
      xName="Month"
      series={SERVICES}
      layout="stacked"
      format={dollars}
      toolbar={
        <Segmented
          label="Range"
          size="sm"
          value={range.value}
          onChange={(v) => (range.value = v)}
          options={RANGES}
        />
      }
    />
  )
}
