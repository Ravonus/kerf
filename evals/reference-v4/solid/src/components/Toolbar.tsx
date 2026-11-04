import type { View } from '../App'

export function Toolbar(props: { view: View; onView: (patch: Partial<View>) => void }) {
  return (
    <div>
      <label>
        Search{' '}
        <input
          value={props.view.query}
          onInput={(e) => props.onView({ query: e.currentTarget.value })}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={props.view.favoritesOnly}
          onChange={(e) => props.onView({ favoritesOnly: e.currentTarget.checked })}
        />
        Favorites only
      </label>
      <label>
        Sort{' '}
        <select
          value={props.view.sort}
          onChange={(e) => props.onView({ sort: e.currentTarget.value as View['sort'] })}
        >
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
    </div>
  )
}
