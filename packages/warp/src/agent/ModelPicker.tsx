import { DownIcon } from '@weft-js/warp-icons'
import { announce, nextIndex, popover, uid } from '@weft-js/warp-core'
import { derived, state, type State } from '@weft-js/core'
import { Badge } from '../Badge'
import { use } from '@weft-js/warp-core/weft'
import { held } from './bits'
import '../styles'
import '@weft-js/warp-core/styles/components/popover.css'
import '@weft-js/warp-core/styles/app/prompt.css'
import '@weft-js/warp-core/styles/app/suggest.css'
import '@weft-js/warp-core/styles/app/model-menu.css'

/** A model on offer. */
export type ModelOption = {
  id: string
  name: string
  short?: string
  provider?: string | undefined
  description?: string | undefined
  capabilities?: string[]
  context?: string
  cost?: string
}

/**
 * ModelPicker (07 §1.3): the model chip opens a Popover holding a listbox grouped by provider. Each option shows its
 * capabilities, context size and relative cost; the current one is checked. ↑/↓, Home/End move, Enter picks, Escape
 * closes; focus goes back to the chip. `compact` shows the short name.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  compact,
}: {
  models: ModelOption[]
  value?: string | State<string | undefined> | undefined
  onChange?: ((id: string) => void) | undefined
  compact?: boolean | undefined
}) {
  const id = uid('model')
  const open = state(false)
  const picked = held<string | undefined>(
    () => value,
    undefined,
    () => (v: string | undefined) => onChange?.(v!),
  )
  const current = derived(() => models.find((m) => m.id === picked.value) ?? models[0])
  const groups = derived(() =>
    [...new Set(models.map((m) => m.provider ?? ''))].map((name) => ({
      name,
      models: models.filter((m) => (m.provider ?? '') === name),
    })),
  )
  let chip: HTMLButtonElement | undefined
  let panel: HTMLElement | undefined
  use(
    popover,
    () => panel,
    () => ({
      open: open.value,
      trigger: chip!,
      side: 'top' as const,
      align: 'end' as const,
      onClose: () => (open.value = false),
    }),
  )
  const choose = (m: ModelOption) => {
    picked.set(m.id)
    open.value = false
    announce(panel!.ownerDocument, `Model: ${m.name}`)
  }
  const onKey = (e: KeyboardEvent) => {
    const list = [...panel!.querySelectorAll<HTMLElement>('[role="option"]')]
    const at = list.indexOf(e.target as HTMLElement)
    const to = nextIndex(e.key, at, list.length, { orientation: 'vertical' })
    if (to >= 0) {
      e.preventDefault()
      list[to]!.focus()
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      list[at]?.click()
    }
  }
  return (
    <span data-scope="prompt" style="display:contents">
      <button
        ref={(n) => (chip = n)}
        type="button"
        data-part="model"
        aria-haspopup="listbox"
        aria-expanded={open.value ? 'true' : 'false'}
        aria-controls={id}
        onClick={() => (open.value = !open.value)}
      >
        <i></i>
        <span data-part="sr-only">Model: </span>
        <span>{compact ? (current.value?.short ?? current.value?.name) : current.value?.name}</span>
        <DownIcon />
      </button>
      <div
        ref={(n) => (panel = n)}
        id={id}
        data-scope="popover"
        data-part="content"
        popover="manual"
        style="padding:4px;min-inline-size:280px"
      >
        <div data-scope="model-menu" role="listbox" aria-label="Model" onKeyDown={onKey}>
          {groups.value.map((g) => (
            <div key={g.name} role="group" aria-label={g.name || 'Models'}>
              <div data-scope="suggest" style="all:unset">
                <div data-part="group" aria-hidden="true">
                  {g.name || 'Models'}
                </div>
              </div>
              {g.models.map((m) => (
                <div
                  key={m.id}
                  role="option"
                  tabindex="-1"
                  aria-selected={m.id === current.value?.id ? 'true' : 'false'}
                  data-initial={m.id === current.value?.id ? '' : undefined}
                  onClick={() => choose(m)}
                >
                  <b>{m.name}</b>
                  <small>
                    {m.description}{' '}
                    {(m.capabilities ?? []).map((c) => (
                      <Badge key={c} tone="neutral">
                        {c}
                      </Badge>
                    ))}
                  </small>
                  <code>{[m.context, m.cost].filter(Boolean).join(' · ')}</code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </span>
  )
}
