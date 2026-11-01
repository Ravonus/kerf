import { state } from 'weft'

export default function Counter() {
  const n = state(0)
  return <button onClick={() => n.value++}>{n.value}</button>
}
