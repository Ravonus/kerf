import { useEffect, useRef, useState } from 'react'

type Props = { value: string; onSave: (next: string) => void }

export function InlineEdit({ value, onSave }: Props) {
  const [text, setText] = useState(value)
  const [prev, setPrev] = useState(value)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const done = useRef(false)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
    else if (returnFocus.current) { returnFocus.current = false; editRef.current?.focus() }
  }, [editing])

  const start = () => { done.current = false; setDraft(text); setEditing(true) }
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) { onSave(draft); setText(draft) }
    returnFocus.current = true
    setEditing(false)
  }

  return editing ? (
    <input
      ref={inputRef}
      aria-label="Title"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true) }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false) }
      }}
      onBlur={() => finish(true)}
    />
  ) : (
    <div>
      <span data-testid="display">{text}</span>
      <button ref={editRef} onClick={start}>Edit</button>
    </div>
  )
}
