import { indicator, nextIndex } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import '@kerf-js/veneer-core/styles/veneer.css'
import '@kerf-js/veneer-core/styles/components/tabs.css'
import { state } from '@kerf-js/core'

const names = ['Plan', 'Billing', 'Team']

export function Settings() {
  const at = state(0)
  let list: HTMLDivElement | undefined
  use(
    indicator,
    () => list,
    () => ({ selected: '[aria-selected="true"]', at: at.value }),
  )

  const onKey = (e: KeyboardEvent) => {
    const to = nextIndex(e.key, at.value, names.length)
    if (to < 0) return
    e.preventDefault()
    at.value = to
    const tabs = list?.querySelectorAll<HTMLElement>('[role="tab"]')
    tabs?.[to]?.focus()
  }

  return (
    <div data-scope="tabs" data-part="root">
      <div
        ref={(n: any) => (list = n)}
        data-part="list"
        role="tablist"
        aria-label="Settings"
        onKeyDown={onKey}
      >
        {names.map((name, i) => (
          <button
            key={name}
            data-part="trigger"
            role="tab"
            type="button"
            aria-selected={at.value === i ? 'true' : 'false'}
            tabindex={at.value === i ? undefined : '-1'}
            onClick={() => (at.value = i)}
          >
            {name}
          </button>
        ))}
        <span data-part="indicator" aria-hidden="true"></span>
      </div>
      <div data-part="content" role="tabpanel" tabindex="0">
        {names[at.value]}
      </div>
    </div>
  )
}
