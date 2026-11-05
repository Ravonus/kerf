import { state } from '@weft-js/core'
import { Radio, Stack } from '@weft-js/warp'

export function RadioStrategy() {
  const how = state('rolling')
  return (
    <Stack gap="tight">
      <Radio
        name="strategy"
        checked={how.value === 'rolling'}
        hint="One copy at a time, no downtime."
        onChange={() => (how.value = 'rolling')}
      >
        Rolling
      </Radio>
      <Radio
        name="strategy"
        checked={how.value === 'canary'}
        hint="5% of traffic first, then everyone."
        onChange={() => (how.value = 'canary')}
      >
        Canary
      </Radio>
      <Radio
        name="strategy"
        checked={how.value === 'all'}
        hint="Fastest. Drops requests for a moment."
        onChange={() => (how.value = 'all')}
      >
        All at once
      </Radio>
    </Stack>
  )
}
