import type { RouteProps } from '@weft-js/start'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import { SpotlightGate } from '../components/SpotlightGate'
import '../styles/site.css'

export default function Root(props: RouteProps) {
  return (
    <>
      <Header />
      <main id="content">{props.children}</main>
      <Footer />
      <SpotlightGate />
    </>
  )
}
