import type { State } from '@weft-js/core'
import { Avatar } from '../parts'
import { Button } from '../Button'
import { avatarTint, G } from './shared'
import type { held } from './shared'
import type { PrejoinProps } from './Prejoin'

export function PrejoinPreview({
  who,
  micOn,
  camOn,
  preview,
}: {
  who: State<string>
  micOn: ReturnType<typeof held<boolean>>
  camOn: ReturnType<typeof held<boolean>>
  preview: PrejoinProps['preview']
}) {
  return (
    <div data-part="preview">
      <div data-scope="tile" data-cam={camOn.value ? undefined : 'off'}>
        {camOn.value && preview ? (
          <div data-part="video">{preview()}</div>
        ) : (
          <Avatar name={who.value || 'You'} size="xl" style={avatarTint(who.value)} />
        )}
        <span data-part="name">You</span>
      </div>
      <div data-part="preview-controls">
        <Button
          emphasis="soft"
          tone="neutral"
          data-icon-only=""
          aria-pressed={micOn.value ? 'true' : 'false'}
          aria-label="Microphone"
          onClick={() => micOn.set(!micOn.value)}
        >
          <G name={micOn.value ? 'mic' : 'micoff'} />
        </Button>
        <Button
          emphasis="soft"
          tone="neutral"
          data-icon-only=""
          aria-pressed={camOn.value ? 'true' : 'false'}
          aria-label="Camera"
          onClick={() => camOn.set(!camOn.value)}
        >
          <G name={camOn.value ? 'cam' : 'camoff'} />
        </Button>
      </div>
    </div>
  )
}
