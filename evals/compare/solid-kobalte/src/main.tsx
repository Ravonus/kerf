import { createSignal, For } from 'solid-js'
import { render } from 'solid-js/web'
import { Dialog } from '@kobalte/core/dialog'
import { DropdownMenu } from '@kobalte/core/dropdown-menu'
import { NAV } from '../../shared/data'
import { screens } from './screens'
import './app.css'

const Links = () => <ul><For each={NAV}>{n => <li><a href={`#${n.id}`} aria-current={n.id === 'projects' ? 'page' : undefined} class="block rounded px-3 py-2 aria-[current]:bg-gray-100">{n.label}</a></li>}</For></ul>
function App() {
  const [open, setOpen] = createSignal(false)
  const View = screens[Number(location.hash.slice(1)) || 0]
  return (
    <div class="md:grid md:min-h-dvh md:grid-cols-[14rem_1fr]">
      <nav aria-label="Main" class="hidden border-r p-3 md:block"><p class="mb-3 font-bold">Loom</p><Links /></nav>
      <div class="min-w-0">
        <header class="flex items-center gap-2 border-b p-3">
          <Dialog open={open()} onOpenChange={setOpen}>
            <Dialog.Trigger class="md:hidden" aria-label="Open navigation">☰</Dialog.Trigger>
            <Dialog.Portal><Dialog.Overlay class="fixed inset-0 bg-black/40" /><Dialog.Content class="fixed inset-y-0 left-0 w-64 bg-white p-3"><Dialog.Title class="font-bold">Loom</Dialog.Title><Links /></Dialog.Content></Dialog.Portal>
          </Dialog>
          <span class="font-semibold">Projects</span>
          <DropdownMenu>
            <DropdownMenu.Trigger aria-label="Account" class="ml-auto size-9 rounded-full bg-green-100">AR</DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content class="rounded border bg-white p-1 shadow"><DropdownMenu.Item class="px-3 py-1">Profile</DropdownMenu.Item><DropdownMenu.Item class="px-3 py-1 text-red-700">Sign out</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu>
        </header>
        <main class="p-4 md:p-6"><View /></main>
      </div>
    </div>
  )
}
render(() => <App />, document.getElementById('root')!)
