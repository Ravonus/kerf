import { createRoot } from 'react-dom/client'
import { createFakeApi } from './api'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App api={createFakeApi()} />)
