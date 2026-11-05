import { state } from '@weft-js/core'
import { Chip, Row } from '@weft-js/warp'
import { PROJECTS } from '../../world'

export function ChipFilters() {
  const on = state(['Live'])
  const flip = (name: string) =>
    (on.value = on.value.includes(name)
      ? on.value.filter((n) => n !== name)
      : [...on.value, name])
  return (
    <Row gap="tight">
      {['Live', 'Building', 'Failed', 'Paused'].map(
        (name) => (
          <Chip
            key={name}
            pressed={on.value.includes(name)}
            count={
              PROJECTS.filter((p) => p.status === name)
                .length
            }
            onClick={() => flip(name)}
          >
            {name}
          </Chip>
        ),
      )}
    </Row>
  )
}
