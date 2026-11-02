import { Link } from '@weft-js/start'
import { Readout } from './Readout'

export function Footer() {
  return (
    <footer data-site="footer">
      <Readout />
      <nav aria-label="Footer">
        <Link href="/docs">Docs</Link>
        <Link href="/examples">Examples</Link>
        <Link href="/components">Components</Link>
        <Link href="/icons">Icons</Link>
        <Link href="/llms.txt" rel="external">llms.txt</Link>
        <Link href="https://github.com/Ravonus/weft" rel="external">GitHub</Link>
      </nav>
    </footer>
  )
}
