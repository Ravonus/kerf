import { Button, Row, Stack } from '@weft-js/warp'
import { TONES } from '../../world'

export const ButtonTones = () => (
  <Stack gap="related">
    {TONES.map((tone) => (
      <Row key={tone} gap="related">
        <Button tone={tone}>Deploy</Button>
        <Button tone={tone} emphasis="soft">
          Deploy
        </Button>
        <Button tone={tone} emphasis="outline">
          Deploy
        </Button>
        <Button tone={tone} emphasis="ghost">
          Deploy
        </Button>
      </Row>
    ))}
  </Stack>
)
