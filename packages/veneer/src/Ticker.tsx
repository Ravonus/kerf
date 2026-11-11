import { derived } from '@kerf-js/core'
import './styles'
import '@kerf-js/veneer-core/styles/components/ticker.css'

/** Props for Ticker. */
export interface TickerProps {
  value: number
  /** Passed to Intl.NumberFormat: `{ style: 'currency', currency: 'USD' }`. */
  format?: Intl.NumberFormatOptions | undefined
  locale?: string | undefined
}

/**
 * A number that rolls (05 §5): each digit is a column of 0–9 drawn by CSS and moved by one custom property, so a change
 * writes one attribute per digit that moved. Digits are keyed from the right, so a new leading digit arrives on its own.
 * The real value is in the DOM for readers; under reduced motion it swaps.
 */
export function Ticker({ value, format, locale }: TickerProps) {
  const fmt = derived(() => new Intl.NumberFormat(locale, format)) // apart from the text: a tick mustn't rebuild it
  const text = derived(() => fmt.value.format(value))
  const parts = derived(() => {
    // oxlint-disable-next-line typescript/no-misused-spread -- code points are what it wants: a glyph per step, and Intl.Segmenter would cost a hot loop
    const s = [...text.value]
    return s.map((c, i) => ({ c, at: s.length - i }))
  })
  return (
    <span data-scope="ticker">
      <span data-part="sr">{text.value}</span>
      <span aria-hidden="true">
        {parts.value.map((p) =>
          /\d/.test(p.c) ? (
            <span key={p.at} data-part="digit" style={`--_d:${p.c};--_at:${p.at}`}></span>
          ) : (
            <span key={p.at} data-part="sym">
              {p.c}
            </span>
          ),
        )}
      </span>
    </span>
  )
}
