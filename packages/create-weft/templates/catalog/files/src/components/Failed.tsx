import { Alert, Button } from '@weft-js/warp'

/** What a Boundary shows when its data didn't arrive. */
export function Failed({ what, retry }: { what: string; retry: () => void }) {
  return (
    <Alert
      tone="critical"
      title={`${what} didn't load`}
      live
      actions={
        <Button emphasis="outline" onClick={retry}>
          Try again
        </Button>
      }
    >
      The shop is still here. The connection to the shelves dropped for a moment.
    </Alert>
  )
}
