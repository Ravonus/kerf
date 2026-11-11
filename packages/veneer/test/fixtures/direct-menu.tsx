import { menu } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import { state } from '@kerf-js/core'

export function AccountMenu() {
  const open = state(false)
  let button: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(
    menu,
    () => panel,
    () => ({ open: open.value, trigger: () => button, onClose: () => (open.value = false) }),
  )

  const pick = (run: () => void) => {
    open.value = false
    button?.focus()
    run()
  }

  return (
    <div>
      <button
        ref={(n: any) => (button = n)}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open.value ? 'true' : 'false'}
        onClick={() => (open.value = !open.value)}
      >
        Account
      </button>
      <div ref={(n: any) => (panel = n)} role="menu" hidden={!open.value}>
        <button
          role="menuitem"
          tabindex="-1"
          type="button"
          onClick={() => pick(() => (location.hash = 'profile'))}
        >
          Profile
        </button>
        <button
          role="menuitem"
          tabindex="-1"
          type="button"
          onClick={() => pick(() => (location.hash = 'out'))}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
