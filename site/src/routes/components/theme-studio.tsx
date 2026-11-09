import type { Meta } from '@weft-js/start'
import { ThemeStudio } from '../../components/studio/ThemeStudio'

export const prerender = true
export const meta: Meta = {
  title: 'Theme studio',
  description:
    'Theme Warp live: colour, shape, type, space, motion, any part in any state and any token, then copy the warp() config.',
}

export default function Page() {
  return (
    <article data-site="studio-page">
      <header>
        <h1>Theme studio</h1>
        <p>
          Every control writes a key of <code data-scope="code">warp()</code>, and the preview runs
          warp's own theme compiler, so what you see is what your build ships. Copy the config into
          weft.config.ts when it looks right.
        </p>
      </header>
      <ThemeStudio />
    </article>
  )
}
