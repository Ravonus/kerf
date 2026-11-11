import { Frame, Text } from '@kerf-js/veneer'

export const FramePlay = (p: {
  ratio?:
    | 'square'
    | '4:3'
    | '3:2'
    | '16:9'
    | '21:9'
    | '3:4'
    | '9:16'
}) => (
  <Frame
    ratio={p.ratio}
    style="inline-size:min(100%,320px)"
  >
    <Text subtle>{p.ratio}</Text>
  </Frame>
)
