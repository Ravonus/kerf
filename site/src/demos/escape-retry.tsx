import { Boundary, resource } from '@weft-js/core'
import {
  Button,
  Card,
  Row,
  Spinner,
  Stack,
} from '@weft-js/warp'

let calls = 0
// Stands in for a request that fails every other time.
const flaky = (signal: AbortSignal) =>
  new Promise<string>((done, fail) => {
    const t = setTimeout(
      () =>
        ++calls % 2 === 1
          ? fail(new Error('The server is busy.'))
          : done(`Answer number ${calls}`),
      600,
    )
    signal.addEventListener('abort', () =>
      clearTimeout(t),
    )
  })

function Answer() {
  const answer = resource(flaky)
  return (
    <>
      {/* Asking again keeps the last answer dimmed
          until the new one lands. */}
      <Row gap="tight">
        <p
          aria-busy={answer.pending ? 'true' : 'false'}
          style={answer.pending ? 'opacity: 0.5' : ''}
        >
          {answer.value}
        </p>
        {answer.pending && answer.value !== undefined && (
          <Spinner label="Asking again" />
        )}
      </Row>
      <Button
        size="sm"
        emphasis="outline"
        disabled={answer.pending}
        onClick={() => answer.refresh()}
      >
        Ask again
      </Button>
    </>
  )
}

export default function Retry() {
  return (
    <Card title="Pending, failed, retried">
      {/* Answer makes the resource inside Boundary,
          so Boundary sees it load and fail. */}
      <Boundary
        pending={<p>Asking the server…</p>}
        error={(e, retry) => (
          <Stack gap="tight">
            <p>
              {e instanceof Error
                ? e.message
                : 'Something went wrong.'}
            </p>
            <Button
              size="sm"
              onClick={retry}
            >
              Try again
            </Button>
          </Stack>
        )}
      >
        <Answer />
      </Boundary>
    </Card>
  )
}
