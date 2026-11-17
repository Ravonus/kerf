import { Boundary, context, derived, resource } from '@kerf-js/core'

const identity = context({ value: () => 'anonymous' })
function Provider(props: { children: () => unknown }) {
  const answer = resource(() => Promise.resolve('collector'))
  const current = derived(() => answer.value ?? 'anonymous')
  return <>{answer.value ? identity.provide({ value: () => current.value }, () => props.children()) : null}</>
}
function Reader() {
  const current = identity.use
  const answer = resource(() => Promise.resolve(current.value()))
  return <h1>{answer.value}</h1>
}
function Gate() {
  const current = identity.use
  return <>{current.value() ? <Boundary pending={<p>Loading child</p>}><Reader /></Boundary> : null}</>
}
export function Context() {
  return <Boundary pending={<p>Loading identity</p>}><Provider>{() => <Gate />}</Provider></Boundary>
}
function ArrayGate() {
  return [() => <Boundary pending={<p>Loading child</p>}><Reader /></Boundary>, () => <small>{identity.use.value()}</small>]
}
export function ContextArray() {
  return <Boundary pending={<p>Loading identity</p>}><Provider>{() => <ArrayGate />}</Provider></Boundary>
}
