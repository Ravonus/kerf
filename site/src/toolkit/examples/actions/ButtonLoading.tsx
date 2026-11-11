import { Button } from '@kerf/veneer'

export const ButtonLoading = () => (
  <>
    <Button loading>Deploying</Button>
    <Button
      emphasis="outline"
      tone="neutral"
      loading
    >
      Deploying
    </Button>
  </>
)
