import { Boundary, context, derived, onCleanup, resource, state } from '@kerf-js/core'

const identity = context({ value: () => 'anonymous' })
function Provider(props: { children: () => unknown }) {
  const answer = resource(() => Promise.resolve('collector'))
  const changed = state(false)
  const current = derived(() =>
    changed.value ? 'collector updated' : (answer.value ?? 'anonymous'),
  )
  return (
    <>
      {answer.value
        ? identity.provide({ value: () => current.value }, () => props.children())
        : null}
      <button onClick={() => (changed.value = true)}>Update identity</button>
      <small data-outside>{identity.use.value()}</small>
    </>
  )
}
type Props = { cleanup?: () => void }
function Reader(props: Props) {
  const current = identity.use
  const answer = resource(() => Promise.resolve(current.value()))
  onCleanup(() => props.cleanup?.())
  return (
    <section>
      <h1>{answer.value}</h1>
      <b>{current.value()}</b>
    </section>
  )
}
function Gate(props: Props) {
  const current = identity.use
  return (
    <>
      {Boolean(current.value()) ? (
        <Boundary pending={<p>Loading child</p>}>
          <Reader cleanup={props.cleanup} />
        </Boundary>
      ) : null}
    </>
  )
}
export function Context(props: Props = {}) {
  return (
    <Boundary pending={<p>Loading identity</p>}>
      <Provider>{() => <Gate cleanup={props.cleanup} />}</Provider>
    </Boundary>
  )
}
function ArrayGate(props: Props) {
  return [
    () => (
      <Boundary pending={<p>Loading child</p>}>
        <Reader cleanup={props.cleanup} />
      </Boundary>
    ),
    () => <small>{identity.use.value()}</small>,
  ]
}
export function ContextArray(props: Props = {}) {
  return (
    <Boundary pending={<p>Loading identity</p>}>
      <Provider>{() => <ArrayGate cleanup={props.cleanup} />}</Provider>
    </Boundary>
  )
}
