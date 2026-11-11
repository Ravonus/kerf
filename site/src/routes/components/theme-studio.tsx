import type { Meta } from '@kerf-js/start'
import { ThemeStudio } from '../../components/studio/ThemeStudio'

export const prerender = true
export const meta: Meta = {
  title: 'Theme studio',
  description:
    'Theme Veneer live: colour, shape, type, space, motion, any part in any state and any token, then copy the veneer() config.',
}

export default function Page() {
  return (
    <article data-site="studio-page">
      <header>
        <h1>Theme studio</h1>
        <p>
          Every control writes a key of <code data-scope="code">veneer()</code>, and the preview runs
          veneer's own theme compiler, so what you see is what your build ships. Copy the config into
          kerf.config.ts when it looks right.
        </p>
      </header>
      <ThemeStudio />
    </article>
  )
}
