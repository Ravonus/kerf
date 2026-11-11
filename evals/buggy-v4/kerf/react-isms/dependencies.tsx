import { derived } from '@kerf/core'
export function App() {
  const value = derived(() => 1, [1])
  return <p />
}
