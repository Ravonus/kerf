import type { View } from '../App'

export function Toolbar({ view, onView }: { view: View; onView: (patch: Partial<View>) => void }) {
  return (
    <div>
      <label>
        Search <input value={view.query} onInput={e => onView({ query: e.currentTarget.value })} />
      </label>
      <label>
        <input type="checkbox" checked={view.favoritesOnly} onChange={e => onView({ favoritesOnly: e.currentTarget.checked })} />
        Favorites only
      </label>
      <label>
        Sort{' '}
        <select value={view.sort} onChange={e => onView({ sort: e.currentTarget.value as View['sort'] })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
    </div>
  )
}
