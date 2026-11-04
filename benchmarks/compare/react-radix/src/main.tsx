import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Dialog from '@radix-ui/react-dialog'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { NAV } from '../../shared/data'
import { screens } from './screens'
import '../../shared/design.css'

const Links = ({ current }: { current: string }) => (
  <ul>
    {NAV.map((n) => (
      <li key={n.id}>
        <a href={`#${n.id}`} aria-current={n.id === current ? 'page' : undefined} className="link">
          {n.label}
        </a>
      </li>
    ))}
  </ul>
)

function App() {
  const [open, setOpen] = useState(false)
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <div className="app">
      <nav aria-label="Main" className="side">
        <p className="brand">Loom</p>
        <Links current="projects" />
      </nav>
      <div className="page">
        <header className="bar">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="burger" aria-label="Open navigation">
              ☰
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="overlay" />
              <Dialog.Content className="drawer">
                <Dialog.Title className="brand">Loom</Dialog.Title>
                <Dialog.Description className="sr">Navigation</Dialog.Description>
                <Links current="projects" />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <span className="title">Projects</span>
          <Menu.Root>
            <Menu.Trigger aria-label="Account" className="avatar push">
              AR
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content className="pop">
                <Menu.Item className="item">Profile</Menu.Item>
                <Menu.Item className="item danger">Sign out</Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>
        <main className="content">
          <View />
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
