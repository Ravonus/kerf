import { derived } from '@kerf/core'
export function App() {
  const value = derived(() => 1)
  return <p>{value.value}</p>
}
