import { state } from 'weft'

const start = ['warp', 'weft', 'loom', 'shed'].map(id => ({ id }))

export default function Rows() {
  const rows = state(start)
  const turn = () => (rows.value = [...rows.value.slice(1), rows.value[0]])
  return (
    <>
      <button onClick={turn}>Rotate</button>
      <ul>{rows.value.map(r => <li key={r.id}>{r.id}</li>)}</ul>
    </>
  )
}
