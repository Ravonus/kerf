import { watch } from '@kerf/core'
export function App() {
  watch(
    () => 1,
    () => {},
  )
  return <p />
}
