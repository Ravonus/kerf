import { prefs } from '../state/prefs'

export default function Prefs() {
  return (
    <main data-theme={prefs.theme.value}>
      <h1>Preferences</h1>
      <button class="theme" onClick={() => prefs.toggle()}>{prefs.theme.value}</button>
    </main>
  )
}
