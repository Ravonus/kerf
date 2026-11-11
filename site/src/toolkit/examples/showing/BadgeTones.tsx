import { TONES } from '../../world'
import { Badge } from '@kerf/veneer'

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
