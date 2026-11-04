// resource + <Boundary> for test/async.test.tsx, compiled for the client, the server and hydration.
import { Boundary, resource, state } from '@weft-js/core'

export type Load = (id: string, signal: AbortSignal) => Promise<{ name: string }>

export function Profile(props: { load: Load; id: string }) {
  const user = resource((signal) => props.load(props.id, signal))
  return <p class="profile">{user.value?.name}</p>
}

export function Users(props: { load: Load }) {
  const id = state('u1')
  return (
    <section>
      <h1>Users</h1>
      <Boundary
        pending={<p class="skeleton">Loading</p>}
        error={(e, retry) => <button onClick={retry}>Retry: {(e as Error).message}</button>}
      >
        <Profile load={props.load} id={id.value} />
      </Boundary>
      <button onClick={() => (id.value = 'u2')}>Next</button>
    </section>
  )
}
