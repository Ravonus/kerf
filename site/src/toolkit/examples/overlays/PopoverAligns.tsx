import { Popover } from '@weft-js/warp'

export const PopoverAligns = () => (
  <>
    <Popover
      label="Start"
      align="start"
      title="Start"
      description={
        'Lines up with the left edge. The default.'
      }
    />
    <Popover
      label="Center"
      align="center"
      title="Center"
      description="Sits in the middle."
    />
    <Popover
      label="End"
      align="end"
      title="End"
      description="Lines up with the right edge."
    />
  </>
)
