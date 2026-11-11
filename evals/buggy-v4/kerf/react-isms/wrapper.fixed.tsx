import { state } from '@kerf/core'
function useCart() {
  return state(0)
}
export function App() {
  useCart()
  return <p />
}
