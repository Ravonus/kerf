import { Boundary, resource, untrack } from '@kerf-js/core'
import { navigate, type RouteProps } from '@kerf-js/start'

const calls = new Map<string, number>()
const gates = new Map<string, (value: string) => void>()
const privateMessage = 'internal recovery fixture fault'

export function load({ request, params }: { request: Request; params: { kind: string } }) {
  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const key = params.kind + token
  if (params.kind === 'release') {
    for (const kind of ['stream', 'boundary']) gates.get(kind + token)?.(privateMessage)
    return { attempt: 0, later: '' }
  }
  const attempt = (calls.get(key) ?? 0) + 1
  calls.set(key, attempt)
  if (params.kind === 'loader' && attempt <= Number(url.searchParams.get('fail') ?? 1))
    throw new Error(privateMessage)
  if (['stream', 'boundary'].includes(params.kind) && attempt === 1)
    return { attempt, later: new Promise<string>((done) => gates.set(key, done)) }
  return { attempt, later: '' }
}

function Streamed(props: { later: Promise<string> | string }) {
  const result = resource(async () => {
    if (await props.later) throw new Error(privateMessage)
    return 'Ready'
  })
  return <p>{result.value}</p>
}

export const meta = ({ params }: { params: { kind: string } }) => ({
  title: 'Recovery test ' + params.kind,
  description: 'Exercise the Start error route.',
})

export default function RecoveryPage(props: RouteProps<typeof load>) {
  const broken = untrack(
    () =>
      props.data.attempt === 1 &&
      (props.params.kind === 'render' ||
        (props.params.kind === 'client' && typeof window !== 'undefined')),
  )
  if (broken) throw new Error(privateMessage)
  return (
    <main>
      <h1>Ready {props.data.attempt}</h1>
      <button
        id="reload-data"
        onClick={() => void navigate(location.href, { reload: true, scroll: false })}
      >
        Reload data
      </button>
      {props.params.kind === 'stream' ? (
        <Boundary pending={<p id="waiting-for-failure">Waiting</p>}>
          <Streamed later={props.data.later} />
        </Boundary>
      ) : props.params.kind === 'boundary' ? (
        <Boundary
          pending={<p id="waiting-for-failure">Waiting</p>}
          error={(error) => (
            <p id="boundary-reference">{(error as Error & { reference?: string }).reference}</p>
          )}
        >
          <Streamed later={props.data.later} />
        </Boundary>
      ) : null}
    </main>
  )
}
