import { TONES } from './badge-data'
import { Tag } from '@weft-js/warp'

export const TagTones = () => (
  <>
    {TONES.map((tone) => (
      <Tag key={tone} tone={tone}>
        Label
      </Tag>
    ))}
  </>
)
