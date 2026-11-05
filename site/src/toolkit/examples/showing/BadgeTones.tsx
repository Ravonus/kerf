import { TONES } from '../../world'
import { Badge } from '@weft-js/warp'

export const BadgeTones = () => (
  <>
    {TONES.map((tone) => (
      <Badge
        key={tone}
        tone={tone}
      >
        Status
      </Badge>
    ))}
  </>
)
