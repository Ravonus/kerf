import { state } from '@kerf/core'
export function App() {
  const value = state(0)
  return <p>{value.value}</p>
}
