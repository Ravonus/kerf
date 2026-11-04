import { createComputed, createSignal, Show } from 'solid-js'

type Props = { value: string; onSave: (next: string) => void }

export function InlineEdit(props: Props) {
  const [text, setText] = createSignal(props.value)
  createComputed(() => setText(props.value))
  const [editing, setEditing] = createSignal(false)
  const [draft, setDraft] = createSignal('')
  let editBtn: HTMLButtonElement | undefined
  let done = false

  const finish = (save: boolean) => {
    if (done) return
    done = true
    if (save) {
      props.onSave(draft())
      setText(draft())
    }
    setEditing(false)
    editBtn?.focus()
  }

  return (
    <Show
      when={editing()}
      fallback={
        <div>
          <span data-testid="display">{text()}</span>
          <button
            ref={editBtn}
            onClick={() => {
              done = false
              setDraft(text())
              setEditing(true)
            }}
          >
            Edit
          </button>
        </div>
      }
    >
      <input
        ref={(el) =>
          queueMicrotask(() => {
            el.focus()
            el.select()
          })
        }
        aria-label="Title"
        value={draft()}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            finish(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            finish(false)
          }
        }}
        onBlur={() => finish(true)}
      />
    </Show>
  )
}
