import { Popover } from '@kerf-js/veneer'

export const PopoverSides = () => (
  <>
    <Popover
      label="Top"
      side="top"
      title="Top"
      description="Opens above the button."
    />
    <Popover
      label="Bottom"
      side="bottom"
      title="Bottom"
      description="Opens below the button."
    />
    <Popover
      label="Left"
      side="left"
      title="Left"
      description="Opens before the button."
    />
    <Popover
      label="Right"
      side="right"
      title="Right"
      description="Opens after the button."
    />
  </>
)
