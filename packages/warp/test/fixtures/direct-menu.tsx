import { menu } from '@weft/warp-core'
import { use } from '@weft/warp-core/weft'
import { state } from 'weft'

export function AccountMenu() {
  const open = state(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(menu, () => panel, () => ({ open: open.value, trigger: () => button, onClose: () => (open.value = false) }))

  const pick = (run: () => void) => {
    open.value = false
    button?.focus()
    run()
  }

  return (
    <div>
      <button ref={(n: any) => (button = n)} type="button" aria-haspopup="menu" aria-expanded={open.value ? 'true' : 'false'} onClick={() => (open.value = !open.value)}>
        Account
      </button>
      <div ref={(n: any) => (panel = n)} role="menu" hidden={!open.value}>
        <button role="menuitem" tabindex="-1" type="button" onClick={() => pick(() => (location.hash = 'profile'))}>Profile</button>
        <button role="menuitem" tabindex="-1" type="button" onClick={() => pick(() => (location.hash = 'out'))}>Sign out</button>
      </div>
    </div>
  )
}
