import { addNote, myNotes } from '../server/notes'

export default function Notes() {
  const list = myNotes.live()
  return (
    <main>
      <p role="status" aria-label="status">{list.live.value}</p>
      <p role="status" aria-label="mode">{list.liveMode.value}</p>
      <ul>{(list.value ?? []).map(n => <li key={n.id}>{n.body}</li>)}</ul>
      <button onClick={() => addNote({ body: `from the app ${Date.now()}` })}>add</button>
    </main>
  )
}
