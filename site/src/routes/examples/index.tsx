import { Link, type Meta } from '@weft/start'
import { Example } from '../../components/Example'
import { demos } from '../../demos'
import { runs } from '../../demos/runs'
import Shop from '../../demos/shop-5'

export const prerender = true
export const meta: Meta = { title: 'Examples', description: 'Small working weft programs, each with its code, what to try and why it matters.' }

function Run(props: { id: string }) {
  return <>{runs[props.id]()}</>
}

export default function Examples() {
  return (
    <div data-site="page" data-part="reading">
      <h1>Examples</h1>
      <p data-part="intro">Each of these is running on this page, and the code beside it is the code that is running. New to weft? Start with the small ones under this shop. <Link href="/docs/getting-started">Set up a project</Link> when you want to try one yourself.</p>
      <Example id="shop-5" title="A whole small shop" lead><Shop /></Example>
      {Object.keys(demos).filter(id => !id.startsWith('shop-')).map(id => <Example key={id} id={id}><Run id={id} /></Example>)}
    </div>
  )
}
