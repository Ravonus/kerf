import { derived, untrack } from 'weft'
import './styles'
import '@weft/ui-core/styles/components/ticker.css'

export interface TickerProps {
  value: number
  /** Passed to Intl.NumberFormat: `{ style: 'currency', currency: 'USD' }`. */
  format?: Intl.NumberFormatOptions
  locale?: string
}

/**
 * A number that rolls (05 §5): each digit is a column of 0–9 drawn by CSS and moved by one custom property, so a change
 * writes one attribute per digit that moved. Digits are keyed from the right, so a new leading digit arrives on its own.
 * The real value is in the DOM for readers; under reduced motion it swaps.
 */
export function Ticker({ value, format, locale }: TickerProps) {
  const fmt = untrack(() => new Intl.NumberFormat(locale, format))
  const text = derived(() => fmt.format(value))
  const parts = derived(() => {
    const s = [...text.value]
    return s.map((c, i) => ({ c, at: s.length - i }))
  })
  return (
    <span data-scope="ticker">
      <span data-part="sr">{text.value}</span>
      <span aria-hidden="true">
        {parts.value.map(p => /\d/.test(p.c)
          ? <span key={p.at} data-part="digit" style={`--_d:${p.c};--_at:${p.at}`}></span>
          : <span key={p.at} data-part="sym">{p.c}</span>)}
      </span>
    </span>
  )
}
