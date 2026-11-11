import { state } from '@kerf-js/core'
export function App() {
  const value = state(0)
  return <p>{value.value}</p>
}
