/** The search box for the current tab. The text and requests live in App, so they survive tab switches. */
export function Search({ text, onText, pending, failed }: {
  text: string
  onText: (text: string) => void
  pending: boolean
  failed: boolean
}) {
  return (
    <div>
      <label>
        Search <input value={text} onChange={e => onText(e.target.value)} />
      </label>
      {pending && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
    </div>
  )
}
