import { createSignal, For } from 'solid-js'
import { render } from 'solid-js/web'
import { Dialog } from '@kobalte/core/dialog'
import { DropdownMenu } from '@kobalte/core/dropdown-menu'
import { NAV } from '../../shared/data'
import { screens } from './screens'
import '../../shared/design.css'

const Links = () => (
  <ul>
    <For each={NAV}>
      {(n) => (
        <li>
          <a href={`#${n.id}`} aria-current={n.id === 'projects' ? 'page' : undefined} class="link">
            {n.label}
          </a>
        </li>
      )}
    </For>
  </ul>
)
function App() {
  const [open, setOpen] = createSignal(false)
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <div class="app">
      <nav aria-label="Main" class="side">
        <p class="brand">Loom</p>
        <Links />
      </nav>
      <div class="page">
        <header class="bar">
          <Dialog open={open()} onOpenChange={setOpen}>
            <Dialog.Trigger class="burger" aria-label="Open navigation">
              ☰
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay class="overlay" />
              <Dialog.Content class="drawer">
                <Dialog.Title class="brand">Loom</Dialog.Title>
                <Links />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog>
          <span class="title">Projects</span>
          <DropdownMenu>
            <DropdownMenu.Trigger aria-label="Account" class="avatar push">
              AR
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content class="pop">
                <DropdownMenu.Item class="item">Profile</DropdownMenu.Item>
                <DropdownMenu.Item class="item danger">Sign out</DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </header>
        <main class="content">
          <View />
        </main>
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
