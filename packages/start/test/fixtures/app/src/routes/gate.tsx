import { Link } from '@kerf-js/start'
import './styled.css'

export default function Gate() {
  return (
    <main>
      <h1 class="styled">Gate</h1>
      <aside data-kerf="styled" id="gated" aria-label="Gated" class="badge">
        Held until styled
      </aside>
      <Link href="/styled">On</Link>
    </main>
  )
}
