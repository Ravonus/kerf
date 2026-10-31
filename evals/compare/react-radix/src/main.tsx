import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import * as Dialog from '@radix-ui/react-dialog'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { NAV } from '../../shared/data'
import { screens } from './screens'
import './app.css'

const Links = ({ current }: { current: string }) => <ul>{NAV.map(n => <li key={n.id}><a href={`#${n.id}`} aria-current={n.id === current ? 'page' : undefined} className="block rounded px-3 py-2 aria-[current]:bg-gray-100">{n.label}</a></li>)}</ul>

function App() {
  const [open, setOpen] = useState(false)
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <div className="md:grid md:min-h-dvh md:grid-cols-[14rem_1fr]">
      <nav aria-label="Main" className="hidden border-r p-3 md:block"><p className="mb-3 font-bold">Loom</p><Links current="projects" /></nav>
      <div className="min-w-0">
        <header className="flex items-center gap-2 border-b p-3">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger className="md:hidden" aria-label="Open navigation">☰</Dialog.Trigger>
            <Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/40" /><Dialog.Content className="fixed inset-y-0 left-0 w-64 bg-white p-3"><Dialog.Title className="font-bold">Loom</Dialog.Title><Dialog.Description className="sr-only">Navigation</Dialog.Description><Links current="projects" /></Dialog.Content></Dialog.Portal>
          </Dialog.Root>
          <span className="font-semibold">Projects</span>
          <Menu.Root>
            <Menu.Trigger aria-label="Account" className="ml-auto size-9 rounded-full bg-green-100">AR</Menu.Trigger>
            <Menu.Portal><Menu.Content className="rounded border bg-white p-1 shadow"><Menu.Item className="px-3 py-1 data-[highlighted]:bg-gray-100">Profile</Menu.Item><Menu.Item className="px-3 py-1 text-red-700 data-[highlighted]:bg-gray-100">Sign out</Menu.Item></Menu.Content></Menu.Portal>
          </Menu.Root>
        </header>
        <main className="p-4 md:p-6"><View /></main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
