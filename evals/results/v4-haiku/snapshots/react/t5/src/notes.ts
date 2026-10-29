type Undo = { id: string; before: string | undefined }
type State = { notes: ReadonlyMap<string, string>; undo: readonly Undo[] }

/** Notes per stock (kept in memory) and the stack of saves that Undo walks back, across all stocks. */
export class NotesStore {
  private state: State = { notes: new Map(), undo: [] }
  private listeners = new Set<() => void>()

  snapshot = () => this.state

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  save(id: string, text: string) {
    const notes = new Map(this.state.notes).set(id, text)
    this.set({ notes, undo: [...this.state.undo, { id, before: this.state.notes.get(id) }] })
  }

  /** Undoes the latest save. Returns the stock and the note it now has, or null when there is nothing to undo. */
  undo(): { id: string; text: string } | null {
    const last = this.state.undo.at(-1)
    if (!last) return null
    const notes = new Map(this.state.notes)
    if (last.before === undefined) notes.delete(last.id)
    else notes.set(last.id, last.before)
    this.set({ notes, undo: this.state.undo.slice(0, -1) })
    return { id: last.id, text: last.before ?? '' }
  }

  private set(state: State) {
    this.state = state
    this.listeners.forEach(cb => cb())
  }
}
