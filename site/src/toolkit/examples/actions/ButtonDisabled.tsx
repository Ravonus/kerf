import { Button } from '@weft-js/warp'

export const ButtonDisabled = () => (
  <>
    <Button aria-disabled="true">Deploy</Button>
    <Button emphasis="outline" tone="neutral" aria-disabled="true">
      Deploy
    </Button>
    <Button disabled>Deploy</Button>
  </>
)
