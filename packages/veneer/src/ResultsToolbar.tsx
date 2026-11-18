import './styles'
import '@kerf-js/veneer-core/styles/components/results-toolbar.css'

/** The count, its caller-supplied noun and the controls for a list. */
export interface ResultsToolbarProps {
  count: number
  /** Localized singular or plural noun for this count. */
  noun?: string | undefined
  /** Supply a locale explicitly for locale-specific formatting on both server and client. */
  locale?: string | undefined
  /** Extra content immediately after the result count. */
  leading?: unknown
  actions?: unknown
  /** Announce changes to the count politely. */
  announce?: boolean | undefined
  [attr: string]: unknown
}

/** A responsive row of list controls with a count that can announce updates. */
export function ResultsToolbar({
  count,
  noun,
  locale = 'en-US',
  leading,
  actions,
  announce,
  ...rest
}: ResultsToolbarProps) {
  return (
    <div {...rest} data-scope="results-toolbar">
      <div data-part="results-summary">
        <span data-part="results-count" role={announce ? 'status' : undefined}>
          <strong>{count.toLocaleString(locale)}</strong>
          {noun && <span data-part="results-noun">{` ${noun}`}</span>}
        </span>
        {leading}
      </div>
      {actions != null && <div data-part="results-actions">{actions}</div>}
    </div>
  )
}
