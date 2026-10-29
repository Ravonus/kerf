import { render } from 'solid-js/web'
import { createFakeApi } from './api'
import { App } from './App'

render(() => <App api={createFakeApi()} />, document.getElementById('root')!)
