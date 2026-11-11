import { UndoIcon, XIcon } from '@kerf/veneer-icons'
import { Button } from '../Button'
import type { signatureState } from './state'

type View = ReturnType<typeof signatureState>
export function SignatureControl({ view }: { view: View }) {
  return (
    <div ref={(n) => (view.refs.pad = n)} data-part="pad">
      <canvas
        ref={(n) => (view.refs.canvas = n)}
        role="img"
        aria-label={view.name.value}
        style={view.method.value === 'type' ? 'visibility:hidden' : undefined}
        onPointerDown={view.down}
        onPointerMove={view.move}
        onPointerUp={view.up}
        onPointerCancel={view.up}
      ></canvas>
      <span data-part="empty"></span>
      <span data-part="baseline" aria-hidden="true">
        ×
      </span>
      <input
        ref={(n) => (view.refs.box = n)}
        data-part="typed"
        hidden={view.method.value !== 'type'}
        aria-label="Type your full name"
        placeholder="Type your full name"
        autocomplete="name"
        value={view.typed.value}
        onInput={(e) => {
          view.typed.value = e.currentTarget.value
          view.emit()
        }}
      />
    </div>
  )
}
export function SignatureFooter({ view }: { view: View }) {
  return (
    <div class="row" style="justify-content:space-between">
      <span class="muted" aria-live="polite">
        {view.status.value}
      </span>
      <span class="row">
        {view.method.value === 'draw' && (
          <Button
            emphasis="ghost"
            size="sm"
            icon={UndoIcon}
            disabled={!view.count.value}
            onClick={view.undo}
          >
            Undo
          </Button>
        )}
        <Button
          emphasis="ghost"
          size="sm"
          icon={XIcon}
          disabled={!view.has.value}
          onClick={view.clear}
        >
          Clear
        </Button>
      </span>
    </div>
  )
}
