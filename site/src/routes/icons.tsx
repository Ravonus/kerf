import { IconBrowser } from '../components/IconBrowser'
import '../styles/docs.css'
import icons from '../generated/icons.json'

export const prerender = true
export const meta = {
  title: 'Icon browser',
  description: `${icons.names.length} icons, hollow and solid, drawn again for each of warp's three tiers. Search them all.`,
}

export default function Icons() {
  return (
    <section data-site="page">
      <h1>Icons</h1>
      <p data-site="lede">
        {icons.names.length} names. Each has a hollow and a solid drawing in each of the three
        tiers, and an app ships only the ones it imports.
      </p>
      <IconBrowser />
      <noscript>
        <ul data-site="icon-names">
          {icons.names.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </noscript>
    </section>
  )
}
