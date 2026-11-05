import { Button } from '@weft-js/warp'

export const ButtonLoading = () => (
  <>
    <Button loading>Deploying</Button>
    <Button emphasis="outline" tone="neutral" loading>
      Deploying
    </Button>
  </>
)
