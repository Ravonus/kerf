// text() for weft.config.ts (research 13 §3.4, research 26 §3, research 33 §6): declares the app's fonts once and
// provides font.build@1 and text.measure@1. The build (src/build.mjs) runs in @weft-js/core/vite through
// `.weft/slots/font.build.build.json`; the engine (src/measure.mjs) loads only when something measures.
import { fileURLToPath } from 'node:url'
import { definePlugin, defineSlot, provide } from '@weft-js/core/plugin'
import { matcher } from './glyphs.mjs'

const fontBuild = defineSlot({ id: 'font.build', version: 1, cardinality: 'one', sides: ['build'] })
const textMeasure = defineSlot({
  id: 'text.measure',
  version: 1,
  cardinality: 'one',
  sides: ['client', 'worker'],
})

export const SUBSETS = [
  'latin',
  'latin-ext',
  'cyrillic',
  'cyrillic-ext',
  'greek',
  'greek-ext',
  'vietnamese',
]
const DISPLAYS = ['swap', 'optional', 'fallback']
const ENGINES = ['slim', 'pretext']
/** Roles preloaded unless a face says otherwise: the text above the fold at every dial stop. */
const PRELOADED = new Set(['body', 'display'])

const fail = (path, message) => {
  throw Object.assign(new Error(message), { path })
}

/** `glyphs`: the characters, or `{ selector, first? }` for the text of the elements a selector matches. */
function glyphs(g, at) {
  if (typeof g === 'string' && g) return
  if (!g || typeof g !== 'object' || typeof g.selector !== 'string')
    fail(at, 'expected the characters the face draws, like "ABC", or { selector, first }')
  for (const key of Object.keys(g))
    if (key !== 'selector' && key !== 'first') fail(`${at}.${key}`, 'unknown option')
  if (g.first !== undefined && typeof g.first !== 'boolean')
    fail(`${at}.first`, 'must be true or false')
  try {
    matcher(g.selector)
  } catch (error) {
    fail(`${at}.selector`, /** @type {Error} */ (error).message)
  }
}

function face(role, f) {
  const at = `fonts.${role}`
  if (!f || typeof f !== 'object') fail(at, 'expected { family, src, fallback }')
  for (const key of ['family', 'src', 'fallback'])
    if (typeof f[key] !== 'string' || !f[key]) fail(`${at}.${key}`, 'expected a non-empty string')
  for (const key of Object.keys(f))
    if (
      ![
        'family',
        'src',
        'fallback',
        'display',
        'weight',
        'style',
        'axes',
        'preload',
        'glyphs',
      ].includes(key)
    )
      fail(`${at}.${key}`, 'unknown option')
  const display = f.display ?? 'swap'
  if (!DISPLAYS.includes(display))
    fail(
      `${at}.display`,
      `must be ${DISPLAYS.map((d) => `'${d}'`).join(' | ')}: \`block\` and \`auto\` hide text while the font loads (X021)`,
    )
  if (f.style !== undefined && f.style !== 'normal' && f.style !== 'italic')
    fail(`${at}.style`, "must be 'normal' or 'italic'")
  if (f.weight !== undefined && !(Number.isInteger(f.weight) && f.weight >= 1 && f.weight <= 1000))
    fail(`${at}.weight`, 'must be an integer 1–1000')
  const axes = f.axes ?? {}
  for (const [axis, range] of Object.entries(axes)) {
    if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite))
      fail(`${at}.axes.${axis}`, 'expected [min, max]')
  }
  if (f.glyphs !== undefined) glyphs(f.glyphs, `${at}.glyphs`)
  return {
    ...(f.glyphs !== undefined && { glyphs: f.glyphs }),
    family: f.family,
    src: f.src,
    fallback: f.fallback,
    display,
    weight: f.weight ?? 400,
    style: f.style ?? 'normal',
    axes,
    preload: f.preload ?? PRELOADED.has(role),
  }
}

function options(input) {
  for (const key of Object.keys(input))
    if (!['fonts', 'subsets', 'measure', 'engine', 'trim'].includes(key))
      fail(key, 'unknown option')
  const measure = input.measure ?? 'auto'
  if (measure !== 'auto' && measure !== 'off') fail('measure', "must be 'auto' or 'off'")
  const engine = input.engine ?? 'slim'
  if (!ENGINES.includes(engine))
    fail('engine', `must be ${ENGINES.map((e) => `'${e}'`).join(' | ')}`)
  const trim = input.trim ?? true
  if (typeof trim !== 'boolean') fail('trim', 'must be true or false')
  const subsets = input.subsets ?? ['latin']
  if (!Array.isArray(subsets) || !subsets.length) fail('subsets', 'expected a non-empty array')
  for (const [i, s] of subsets.entries())
    if (!SUBSETS.includes(s))
      fail(`subsets.${i}`, `unknown subset \`${s}\` (${SUBSETS.join(', ')})`)
  const fonts = {}
  for (const [role, f] of Object.entries(input.fonts ?? {})) fonts[role] = face(role, f)
  return { fonts, subsets, measure, engine, trim }
}

export const text = definePlugin({
  name: '@weft-js/text',
  version: '0.0.0',
  weft: '*',
  options,
  permissions: { fs: { read: ['**/*.{woff2,woff,ttf,otf}'] } },
  contribute: (o) => ({
    // Generated share cards set their title and text in the app's faces.
    card: {
      fonts: Object.fromEntries(
        ['display', 'body']
          .filter((r) => o.fonts?.[r]?.src)
          .map((r) => [
            r,
            { family: o.fonts[r].family, src: o.fonts[r].src, weight: o.fonts[r].weight },
          ]),
      ),
    },
    provides: [
      provide(fontBuild, {
        sides: {
          build: {
            module: fileURLToPath(new URL('./build.mjs', import.meta.url)),
            export: 'createFontBuild',
            options: { fonts: o.fonts, subsets: o.subsets, trim: o.trim },
          },
        },
      }),
      ...(o.measure === 'off'
        ? []
        : [
            provide(textMeasure, {
              sides: {
                client: {
                  module: '@weft-js/text/measure',
                  export: 'createMeasure',
                  options: { engine: o.engine },
                },
              },
            }),
          ]),
    ],
    agents: {
      title: 'Fonts (@weft-js/text)',
      text: [
        '- Declare fonts once in `text({ fonts })` in weft.config.ts: `{ body: { family, src, fallback } }`. Never hand-write `@font-face` (X020).',
        '- The build subsets each face by `unicode-range`, adds a metric-matched `"<Family> Fallback"` face and preloads `body` and `display`. `@weft-js/core/vite` loads them: no import. `weft docs fonts`.',
        '- A build trims faces on its own: custom axes the source never varies are pinned, and uncommon latin characters load on demand. An axis set at runtime needs declaring in `axes`; `trim: false` turns it all off.',
        "- `text.measure` is lazy: it costs nothing until something measures, a canvas `s.text()`, `measure()`, `lines()` or `fit()` from @weft-js/core/text, or a warp list given `text` (`measure: 'off'` removes it).",
        '- Font stacks name the fallback second: `font-family: "Inter", "Inter Fallback", sans-serif`. `font-display` is `swap` or `optional`, never `block` (X021).',
      ].join('\n'),
    },
    catalog: [
      {
        name: 'text',
        import: '@weft-js/text',
        summary:
          'font.build: subsets, matched fallback faces, preloads; text.measure: lazy line breaking for canvas text and exact row heights',
      },
    ],
  }),
})
