import { Dither } from '@kerf-js/veneer'

export const DitherImage = () => (
  <Dither
    src="/art/field.png"
    alt="A green and white landscape of soft shapes"
    ratio="16 / 10"
    cell={3}
  />
)
