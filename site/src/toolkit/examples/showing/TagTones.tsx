import { TONES } from '../../world'
import { Tag } from '@weft-js/warp'

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
