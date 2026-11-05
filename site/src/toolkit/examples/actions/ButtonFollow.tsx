import { Button } from '@weft-js/warp'

export const ButtonFollow = () => (
  <>
    <Button>Wipe</Button>
    <Button follow>Follow</Button>
    <Button
      follow
      emphasis="soft"
    >
      Follow
    </Button>
    <Button
      follow
      emphasis="outline"
      tone="neutral"
    >
      Follow
    </Button>
  </>
)
