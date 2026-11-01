import { Link } from '@weft/start'
import { Readout } from './Readout'

export function Footer() {
  return (
    <footer data-site="footer">
      <Readout />
      <nav aria-label="Footer">
        <Link href="/docs">Docs</Link>
        <Link href="/examples">Examples</Link>
        <Link href="/toolkit">Toolkit</Link>
        <Link href="/icons">Icons</Link>
        <a href="/llms.txt" rel="external">llms.txt</a>
        <a href="https://github.com/Ravonus/weft" rel="external">GitHub</a>
      </nav>
    </footer>
  )
}
