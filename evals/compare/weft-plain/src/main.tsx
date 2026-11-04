import { render } from '@weft-js/core/dom'
import { NAV } from '../../shared/data'
import { screens } from './screens'
import '../../shared/design.css'

const Links = () => (
  <ul>
    {NAV.map((n) => (
      <li key={n.id}>
        <a class="link" href={`#${n.id}`} aria-current={n.id === 'projects' ? 'page' : undefined}>
          {n.label}
        </a>
      </li>
    ))}
  </ul>
)

function App() {
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <div class="app">
      <nav aria-label="Main" class="side">
        <p class="brand">Loom</p>
        <Links />
      </nav>
      <div class="page">
        <header class="bar">
          <button class="burger" popovertarget="drawer" aria-label="Open navigation">
            ☰
          </button>
          <div popover id="drawer" class="drawer">
            <p class="brand">Loom</p>
            <Links />
          </div>
          <span class="title">Projects</span>
          <button class="avatar push" popovertarget="account" aria-label="Account">
            AR
          </button>
          <div popover id="account" class="pop">
            <button class="item">Profile</button>
            <button class="item danger">Sign out</button>
          </div>
        </header>
        <main class="content">
          <View />
        </main>
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
