import { render } from '@weft-js/core/dom'
import { createFakeApi } from './api'
import { App } from './App'
import './shop.css'

const api = createFakeApi()
render(() => <App api={api} />, document.getElementById('root')!)
