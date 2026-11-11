import { Alert, Button } from '@kerf-js/veneer'

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
      Nothing's lost. The connection to the store dropped for a moment.
    </Alert>
  )
}
