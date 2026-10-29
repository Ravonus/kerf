// The v3 shop hydrating server HTML instead of rendering (compiled with `hydratable: true`).
import { hydrate } from 'weft/dom'
import { createFakeApi } from '../../../../evals/reference-v3/weft/src/api'
import { App } from '../../../../evals/reference-v3/weft/src/App'

hydrate(() => <App api={createFakeApi()} />, document.getElementById('root')!)
