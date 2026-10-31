import { derived } from 'weft'
import { Icon } from '../Icon'
import { Shimmer } from './Shimmer'
import '../styles'
import '@weft/ui-core/styles/app/reasoning.css'

/** Reasoning (07 §1.2): a native details. "Thinking…" while it streams, open; it folds itself and keeps the duration. */
export function Reasoning({ text, streaming, seconds }: { text: string; streaming?: boolean; seconds?: number }) {
  const label = derived(() => (seconds !== undefined ? `Thought for ${seconds} s` : 'Thought'))
  return (
    <details data-scope="reasoning" data-state={streaming ? 'streaming' : 'done'} open={!!streaming}>
      <summary>
        <Icon name="right" data-part="chev" />
        {streaming ? <Shimmer>Thinking…</Shimmer> : <span>{label.value}</span>}
      </summary>
      <div data-part="body">{text}</div>
    </details>
  )
}
