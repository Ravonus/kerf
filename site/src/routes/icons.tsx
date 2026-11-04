import { SideNav } from '@weft-js/warp'
import { IconBrowser } from '../components/IconBrowser'
import { toolkitSections, SITE_LINKS } from '../lib/sections'
import '../styles/docs.css'
import icons from '../generated/icons.json'

export const prerender = true
export const meta = {
  title: 'Icon browser',
  description: `${icons.names.length} icons, hollow and solid, drawn again for each of warp's three tiers. Search them all.`,
}

const sections = toolkitSections('icons')

export default function Icons() {
  return (
    <div data-site="docs">
      <SideNav
        lead={SITE_LINKS}
        label="Icons"
        sections={sections}
        current="/icons"
        remember="weft:site:toolkit"
      />
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
    </div>
  )
}
