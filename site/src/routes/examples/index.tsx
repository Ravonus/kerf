import { Link, type Meta } from '@weft/start'
import { Example } from '../../components/Example'
import { demos } from '../../demos'

export const prerender = true
export const meta: Meta = { title: 'Examples', description: 'Small working weft programs, each with its code, what to try and why it matters.' }

export default function Examples() {
  return (
    <div data-site="page" data-part="reading">
      <h1>Examples</h1>
      <p data-part="intro">Each of these is running on this page, and the code beside it is the code that is running. New to weft? Start at the top. <Link href="/docs/getting-started">Set up a project</Link> when you want to try one yourself.</p>
      {Object.keys(demos).map(id => <Example key={id} id={id} />)}
    </div>
  )
}
