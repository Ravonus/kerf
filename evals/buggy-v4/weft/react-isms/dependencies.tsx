import { derived } from '@weft-js/core'
export function App() { const value = derived(() => 1, [1]); return <p /> }
