import { render } from '@weft-js/core/dom'
import { createFakeApi } from './api'
import { App } from './App'

render(() => <App api={createFakeApi()} />, document.getElementById('root')!)
