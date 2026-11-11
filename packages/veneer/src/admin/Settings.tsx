import { untrack } from '@kerf-js/core'
import { uid } from '@kerf-js/veneer-core'
import { Glyph } from '../parts'
import '../styles'
import '@kerf-js/veneer-core/styles/flows/tokens.css'
import '@kerf-js/veneer-core/styles/flows/base.css'
import '@kerf-js/veneer-core/styles/rich/helpers.css'
import '@kerf-js/veneer-core/styles/layout/tokens.css'
import '@kerf-js/veneer-core/styles/layout/row.css'
import '@kerf-js/veneer-core/styles/layout/stack.css'
import '@kerf-js/veneer-core/styles/flows/settings.css'
import '@kerf-js/veneer-core/styles/flows/settings-section.css'
import '@kerf-js/veneer-core/styles/flows/setting-row.css'

/** One link of the settings nav. */
export type SettingsNavItem = {
  id: string
  label: string
  glyph?: string
  tone?: 'critical' | undefined
}

/**
 * The settings frame (09 §4.1): a TabNav-like strip that becomes a sticky column at 760px of its own width, and a form
 * holding the sections. A nav press scrolls to the section and moves focus to its heading.
 */
export function SettingsLayout({
  label = 'Settings sections',
  sections,
  current,
  onNavigate,
  children,
}: {
  label?: string | undefined
  sections: SettingsNavItem[]
  current: string
  onNavigate?: (id: string) => void
  children: unknown
}) {
  const go = (e: MouseEvent, id: string) => {
    e.preventDefault()
    onNavigate?.(id)
    const doc = (e.currentTarget as Element).ownerDocument
    const sec = doc.getElementById(id)
    const reduce = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    sec?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    sec?.querySelector<HTMLElement>('header :is(h3, h4)')?.focus({ preventScroll: true })
  }
  return (
    <div data-scope="settings">
      <div data-part="layout">
        <nav data-part="nav" aria-label={label}>
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              data-tone={s.tone}
              aria-current={s.id === current ? 'true' : undefined}
              onClick={(e: MouseEvent) => go(e, s.id)}
            >
              {s.glyph && <Glyph d={s.glyph} />}
              {s.label}
            </a>
          ))}
        </nav>
        <form data-part="content" novalidate>
          {children}
        </form>
      </div>
    </div>
  )
}

/** A heading, one line, then one bordered group of rows (09 §4.1). `tone="critical"` is the danger zone's border. */
export function SettingsSection({
  id,
  title,
  description,
  tone,
  as: heading = 'h3',
  children,
}: {
  id: string
  title: unknown
  description?: unknown
  tone?: 'critical' | undefined
  as?: 'h3' | 'h4' | undefined
  children: unknown
}) {
  return (
    <section data-scope="settings-section" id={id} data-tone={tone} aria-labelledby={`${id}-h`}>
      <header>
        {heading === 'h4' ? (
          <h4 id={`${id}-h`} tabindex="-1">
            {title}
          </h4>
        ) : (
          <h3 id={`${id}-h`} tabindex="-1">
            {title}
          </h3>
        )}
        {description !== undefined && <p>{description}</p>}
      </header>
      <div data-part="group">{children}</div>
    </section>
  )
}

/**
 * Label and help at the inline-start, the control at the inline-end, stacking under 520px (09 §4.1). `children` may be
 * a function of the label's and help's ids, so a Switch can be labelled by them instead of repeating the words.
 */
export function SettingRow({
  title,
  description,
  layout,
  children,
}: {
  title?: unknown
  description?: unknown
  layout?: 'stack'
  children: unknown
}) {
  const id = uid('row')
  const body = () =>
    typeof children === 'function'
      ? children({ label: `${id}-l`, description: `${id}-d` })
      : children
  const stacked = untrack(() => title === undefined)
  if (stacked)
    return (
      <div data-scope="setting-row" data-layout={layout}>
        {body()}
      </div>
    )
  return (
    <div data-scope="setting-row" data-layout={layout}>
      <div>
        <b id={`${id}-l`}>{title}</b>
        <p id={`${id}-d`}>{description}</p>
      </div>
      <div data-part="control">{body()}</div>
    </div>
  )
}
