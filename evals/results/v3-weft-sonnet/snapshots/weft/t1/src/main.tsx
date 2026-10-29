import { render } from 'weft/dom'
import { createFakeApi } from './api'
import { App } from './App'

const api = createFakeApi()
render(() => <App api={api} />, document.getElementById('root')!)
