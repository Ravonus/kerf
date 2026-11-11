import { render } from '@kerf-js/core/dom'
import { createFakeApi } from './api'
import { App } from './App'

const api = createFakeApi()
render(() => <App api={api} />, document.getElementById('root')!)
