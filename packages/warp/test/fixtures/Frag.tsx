import { state, type State } from '@weft-js/core'
const Cond = ({ on }: { on: State<boolean> }) => <>{on.value && <p id="shown">shown</p>}</>
export const A = () => {
  const on = state(false)
  return (
    <div>
      <button onClick={() => (on.value = !on.value)}>go</button>
      <Cond on={on} />
    </div>
  )
}
export const B = () => {
  const on = state(false)
  return (
    <>
      <button onClick={() => (on.value = !on.value)}>go</button>
      <Cond on={on} />
    </>
  )
}
export const C = () => {
  const on = state(false),
    o2 = state(false)
  return (
    <>
      <h1>t</h1>
      <button onClick={() => (on.value = !on.value)}>go</button>
      <Cond on={on} />
      <Cond on={o2} />
    </>
  )
}
