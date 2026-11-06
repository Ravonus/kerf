import { watch } from '@weft-js/core'
export function App() {
  watch(
    () => 1,
    () => {},
  )
  return <p />
}
