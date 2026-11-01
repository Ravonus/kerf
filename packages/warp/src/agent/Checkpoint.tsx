import { IconUndo } from '@weft/icons'
import { Button } from '../Button'
import '../styles'
import '@weft/ui-core/styles/app/checkpoint.css'

/** Checkpoint (07 §1.3): a hairline with a label and Restore. Restoring forks a branch; `onRestore` decides how. */
export function Checkpoint({ label, onRestore }: { label: any; onRestore?: () => void }) {
  return (
    <div data-scope="checkpoint">
      <span>{label}</span>
      {onRestore && <Button emphasis="ghost" tone="neutral" size="sm" onClick={onRestore}><IconUndo />Restore</Button>}
    </div>
  )
}
