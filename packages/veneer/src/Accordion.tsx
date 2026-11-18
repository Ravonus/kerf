import { DownIcon } from '@kerf-js/veneer-icons'
import { nextIndex, uid } from '@kerf-js/veneer-core'
import { state, untrack } from '@kerf-js/core'
import './styles'
import '@kerf-js/veneer-core/styles/components/accordion.css'

/** One disclosure: its header, its panel and the value that names it. */
export type AccordionItem = {
  value: string
  title: unknown
  content: unknown
  subtitle?: unknown
  /** Non-interactive content alongside the title, such as a badge. */
  trailing?: unknown
  disabled?: boolean | undefined
}
/** Props for Accordion. */
export interface AccordionProps {
  items: AccordionItem[]
  variant?: 'boxed' | 'line' | undefined
  /** More than one open at once. */
  multiple?: boolean
  /** What starts open. */
  defaultOpen?: readonly string[] | undefined
  /** Open items controlled by the caller. */
  open?: readonly string[] | undefined
  onChange?: ((open: string[]) => void) | undefined
  /** The heading level of each title: one below the heading the accordion sits under. Default 3, in a page section. */
  level?: 2 | 3 | 4 | 5 | 6 | undefined
  [attr: string]: unknown
}

/**
 * An accordion (05 §4; APG): each header a real button in a heading, ↑/↓/Home/End between headers. The sweep runs on
 * hover and holds while an item is open; the height moves with grid rows, so nothing is measured.
 */
export function Accordion({
  items,
  variant = 'boxed',
  multiple,
  defaultOpen = [],
  open: controlled,
  onChange,
  level = 3,
  ...rest
}: AccordionProps) {
  const base = uid('acc')
  const local = state<readonly string[]>(untrack(() => defaultOpen))
  const open = () => controlled ?? local.value
  const toggle = (v: string) => {
    const before = open()
    const next = before.includes(v)
      ? before.filter((x) => x !== v)
      : multiple
        ? [...before, v]
        : [v]
    if (controlled === undefined) local.value = next
    onChange?.(next)
  }
  const onKey = (e: KeyboardEvent) => {
    const list = [
      ...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
        ':scope > [data-part="item"] > [data-part="heading"] > [data-part="trigger"]:not(:disabled)',
      ),
    ]
    const at = list.indexOf(e.target as HTMLElement)
    if (at < 0) return
    const to = nextIndex(e.key, at, list.length, { orientation: 'vertical' })
    if (to < 0) return
    e.preventDefault()
    list[to]!.focus()
  }
  return (
    <div
      {...rest}
      data-scope="accordion"
      data-part="root"
      data-variant={variant === 'line' ? 'line' : undefined}
      onKeyDown={onKey}
    >
      {items.map((it, i) => (
        <div key={it.value} data-part="item" data-sweep="">
          <div data-part="heading" role="heading" aria-level={level}>
            <button
              type="button"
              data-part="trigger"
              id={`${base}-h${i}`}
              aria-expanded={open().includes(it.value) ? 'true' : 'false'}
              aria-controls={`${base}-c${i}`}
              disabled={it.disabled}
              onClick={() => toggle(it.value)}
            >
              <AccordionTitle item={it} />
              <DownIcon data-part="chevron" />
            </button>
          </div>
          <div
            data-part="content"
            role="region"
            id={`${base}-c${i}`}
            aria-labelledby={`${base}-h${i}`}
            data-state={open().includes(it.value) ? 'open' : undefined}
          >
            <div
              inert={open().includes(it.value) ? undefined : ''}
              aria-hidden={open().includes(it.value) ? undefined : 'true'}
            >
              <div>{it.content}</div>
            </div>
          </div>
          <span data-part="sweep" aria-hidden="true"></span>
        </div>
      ))}
    </div>
  )
}

function AccordionTitle({ item }: { item: AccordionItem }) {
  return (
    <>
      {item.subtitle != null || item.trailing != null ? (
        <span data-part="trigger-copy">
          <span data-part="trigger-title">
            {item.title}
            {item.trailing}
          </span>
          {item.subtitle != null && <span data-part="subtitle">{item.subtitle}</span>}
        </span>
      ) : (
        item.title
      )}
    </>
  )
}
