import { watch } from '@kerf-js/core'
export function App() {
  watch(
    () => 1,
    () => {},
  )
  return <p />
}
