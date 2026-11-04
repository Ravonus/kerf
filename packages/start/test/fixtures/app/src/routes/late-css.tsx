import './stream-sheet.css'
import './late-css.css'

// Past the first-paint budget, so the head leaves its hover rule to the deferred sheet.
export default function LateCss() {
  return (
    <main data-scope="shell-card">
      <a id="late" href="#">
        Late
      </a>
    </main>
  )
}
