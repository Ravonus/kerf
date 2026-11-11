// The v3 shop hydrating server HTML instead of rendering (compiled with `hydratable: true`).
import { hydrate } from '@kerf-js/core/dom'
import { createFakeApi } from '../../../../evals/reference-v3/kerf/src/api'
import { App } from '../../../../evals/reference-v3/kerf/src/App'

hydrate(() => <App api={createFakeApi()} />, document.getElementById('root')!)
