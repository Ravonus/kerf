import type { RouteProps } from '@weft-js/start'
import { Footer } from '../components/Footer'
import { DocsRail } from '../components/DocsRail'
import { Header } from '../components/Header'
import { ScrollRail } from '@weft-js/warp'
import { SpotlightGate } from '../components/SpotlightGate'
import '../styles/site.css'

/**
 * Runs in the browser: the docs sidebar in it follows the path (`DocsRail`), and a static root would be swapped whole,
 * header and sidebar with it, whenever its HTML changed between sections.
 *
 * @weft client
 */
export default function Root(props: RouteProps) {
  return (
    <>
      <Header />
      <main id="content">
        <DocsRail>{props.children}</DocsRail>
      </main>
      <Footer />
      <SpotlightGate />
      <ScrollRail />
    </>
  )
}
