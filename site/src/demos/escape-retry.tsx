import { Boundary, resource } from '@weft-js/core'
import { Button, Card, Stack } from '@weft-js/warp'

let calls = 0
// Stands in for a request that fails every other time.
const flaky = (signal: AbortSignal) =>
  new Promise<string>((done, fail) => {
    const t = setTimeout(() => (++calls % 2 === 1 ? fail(new Error('The server is busy.')) : done(`Answer number ${calls}`)), 600)
    signal.addEventListener('abort', () => clearTimeout(t))
  })

export default function Retry() {
  const answer = resource(flaky)
  return (
    <Card title="Pending, failed, retried">
      <Boundary
        pending={<p>Asking the server…</p>}
        error={(e, retry) => (
          <Stack gap="tight">
            <p>{e instanceof Error ? e.message : 'Something went wrong.'}</p>
            <Button size="sm" onClick={retry}>Try again</Button>
          </Stack>
        )}
      >
        <p>{answer.value}</p>
        <Button size="sm" emphasis="outline" onClick={() => answer.refresh()}>Ask again</Button>
      </Boundary>
    </Card>
  )
}
