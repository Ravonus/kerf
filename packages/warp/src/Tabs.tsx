import { indicator, nextIndex, overflow, uid } from '@weft/warp-core'
import { untrack } from 'weft'
import { use } from '@weft/warp-core/weft'
import './styles'
import '@weft/warp-core/styles/components/tabs.css'

export type TabOption<V extends string> = { value: V; label: any; disabled?: boolean }

/**
 * Tabs (05 §4; components.html:660-706, 1821-1849): line (default) · pill · enclosed. APG automatic activation:
 * ←/→ move and select (wrapping), Home/End, one tab stop; every tab controls a tabpanel. The indicator travels
 * through the rail on the sweep curve; a list wider than its box scrolls with edge fades and keeps the selected tab
 * in view. `children(value)` renders a panel; a pill strip filters one shared panel.
 */
export function Tabs<V extends string>({ label, value, onChange, options, variant, children }: { label: string; value: V; onChange: (v: V) => void; options: TabOption<V>[]; variant?: 'line' | 'pill' | 'enclosed'; children?: (value: V) => any }) {
  const base = uid('tabs')
  const kind = untrack(() => variant)
  const tab = (i: number) => `${base}-t${i}`
  const panel = (i: number) => (kind === 'pill' ? `${base}-p0` : `${base}-p${i}`)
  let list: HTMLDivElement | undefined
  use(indicator, () => list, () => ({ selected: '[aria-selected="true"]', at: value }))
  use(overflow, () => list, () => list?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null)
  const onKey = (e: KeyboardEvent) => {
    const tabs = options.filter(o => !o.disabled)
    const at = tabs.findIndex(o => o.value === value)
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    const to = nextIndex(e.key, at, tabs.length, { rtl })
    if (to < 0) return
    e.preventDefault()
    onChange(tabs[to].value)
    ;(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')[options.findIndex(o => o.value === tabs[to].value)]?.focus() // by position: a hydrated server id isn't this side's
  }
  const selected = () => options.findIndex(o => o.value === value)
  return (
    <div data-scope="tabs" data-part="root" data-variant={kind === 'line' ? undefined : kind}>
      <div ref={(n: any) => (list = n)} data-part="list" role="tablist" aria-label={label} onKeyDown={onKey}>
        {options.map((o, i) => (
          <button
            key={o.value}
            data-part="trigger"
            role="tab"
            type="button"
            id={tab(i)}
            aria-controls={panel(i)}
            aria-selected={o.value === value ? 'true' : 'false'}
            tabindex={o.value === value ? undefined : '-1'}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
        <span data-part="indicator" aria-hidden="true" data-instant=""></span>
      </div>
      {kind === 'pill' ? (
        <div data-part="content" role="tabpanel" id={panel(0)} aria-labelledby={tab(selected())} tabindex="0" hidden={!children}>{children?.(value)}</div>
      ) : (
        options.map((o, i) => (
          <div key={o.value} data-part="content" role="tabpanel" id={panel(i)} aria-labelledby={tab(i)} tabindex="0" hidden={o.value !== value}>
            {children?.(o.value)}
          </div>
        ))
      )}
    </div>
  )
}
