import { TONES } from '../../world'
import { Tag } from '@kerf-js/veneer'

export const TagTones = () => (
  <>
    {TONES.map((tone) => (
      <Tag
        key={tone}
        tone={tone}
      >
        Label
      </Tag>
    ))}
  </>
)
