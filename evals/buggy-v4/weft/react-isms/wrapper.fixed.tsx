import { state } from '@weft-js/core'
function useCart() { return state(0) }
export function App() { useCart(); return <p /> }
