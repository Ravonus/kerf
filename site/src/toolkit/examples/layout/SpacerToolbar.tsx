import { state } from '@weft-js/core'
import {
  Button,
  Row,
  Segmented,
  Spacer,
} from '@weft-js/warp'
import { VIEWS } from './shared'

export function SpacerToolbar() {
  const view = state('all')
  return (
    <Row gap="related">
      <Segmented
        size="sm"
        label="Show"
        value={view.value}
        options={VIEWS}
        onChange={(v) => (view.value = v)}
      />
      <Spacer />
      <Button
        emphasis="ghost"
        tone="neutral"
        icon="download"
      >
        Export
      </Button>
      <Button icon="plus">New project</Button>
    </Row>
  )
}
