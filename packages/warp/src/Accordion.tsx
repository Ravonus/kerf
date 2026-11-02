import { DownIcon } from '@weft-js/warp-icons'
import { nextIndex, uid } from '@weft-js/warp-core'
import { state, untrack } from '@weft-js/core'
import './styles'
import '@weft-js/warp-core/styles/components/accordion.css'

export type AccordionItem = { value: string; title: any; content: any; disabled?: boolean }
export interface AccordionProps {
  items: AccordionItem[]
  variant?: 'boxed' | 'line'
  /** More than one open at once. */
  multiple?: boolean
  /** What starts open. */
  defaultOpen?: string[]
  onChange?: (open: string[]) => void
  /** The heading level of each title. */
  level?: 2 | 3 | 4 | 5 | 6
}

/**
 * An accordion (05 §4; APG): each header a real button in a heading, ↑/↓/Home/End between headers. The sweep runs on
 * hover and holds while an item is open; the height moves with grid rows, so nothing is measured.
 */
export function Accordion({ items, variant = 'boxed', multiple, defaultOpen = [], onChange, level = 3 }: AccordionProps) {
  const base = uid('acc')
  const open = state<string[]>(untrack(() => defaultOpen))
  const toggle = (v: string) => {
    const on = open.value.includes(v)
    open.value = on ? open.value.filter(x => x !== v) : multiple ? [...open.value, v] : [v]
    onChange?.(open.value)
  }
  const onKey = (e: KeyboardEvent) => {
    const list = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-part="trigger"]:not(:disabled)')]
    const at = list.indexOf(e.target as HTMLElement)
    if (at < 0) return
    const to = nextIndex(e.key, at, list.length, { orientation: 'vertical' } as any)
    if (to < 0) return
    e.preventDefault()
    list[to].focus()
  }
  return (
    <div data-scope="accordion" data-part="root" data-variant={variant === 'line' ? 'line' : undefined} onKeyDown={onKey}>
      {items.map((it, i) => (
        <div key={it.value} data-part="item" data-sweep="">
          <div data-part="heading" role="heading" aria-level={level}>
            <button type="button" data-part="trigger" id={`${base}-h${i}`} aria-expanded={open.value.includes(it.value) ? 'true' : 'false'} aria-controls={`${base}-c${i}`} disabled={it.disabled} onClick={() => toggle(it.value)}>
              {it.title}<DownIcon data-part="chevron" />
            </button>
          </div>
          <div data-part="content" role="region" id={`${base}-c${i}`} aria-labelledby={`${base}-h${i}`} data-state={open.value.includes(it.value) ? 'open' : undefined}><div><div>{it.content}</div></div></div>
          <span data-part="sweep" aria-hidden="true"></span>
        </div>
      ))}
    </div>
  )
}
