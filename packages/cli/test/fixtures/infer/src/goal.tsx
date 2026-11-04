import { state } from '@weft-js/core'

function Button(props: { onClick?: () => void; children?: unknown; variant?: string }) {
  return <button onClick={props.onClick}>{props.children}</button>
}
function AddButton(props) {
  return <Button onClick={() => props.count++}>Add</Button>
}
export default function Shop() {
  const count = state(0)
  return <AddButton bind:count={count} />
}
