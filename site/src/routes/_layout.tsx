import type { RouteProps } from '@weft/start'
import { Footer } from '../components/Footer'
import { Header } from '../components/Header'
import '../styles/site.css'

export default function Root(props: RouteProps) {
  return (
    <>
      <Header />
      <main id="content">{props.children}</main>
      <Footer />
    </>
  )
}
