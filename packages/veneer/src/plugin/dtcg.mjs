// Export resolved veneer tokens in the DTCG format.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The resolved tokens as DTCG 2025.10: one token file per theme × expression and a resolver over them. `css`: the app's seed and overrides. */
export function dtcgTokens(css, core) {
  const dir = mkdtempSync(join(tmpdir(), 'veneer-seed-'))
  let resolved
  try {
    const file = join(dir, 'veneer.css')
    writeFileSync(
      file,
      readFileSync(new URL('styles/veneer.css', core), 'utf8') +
        `\n${css.replace(/@layer veneer\.\w+\{([\s\S]*)\}\n?$/gm, '$1')}\n`,
    )
    let out
    try {
      out = execFileSync(
        process.execPath,
        [fileURLToPath(new URL('scripts/contrast-check.mjs', core)), file, '--json'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    } catch (e) {
      out = e.stdout
    }
    resolved = JSON.parse(out).resolved
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const px = (value) => ({ $value: { value, unit: 'px' } })
  const SPACE = { hair: 2, tight: 4, related: 8, group: 16 }
  const X = { quiet: 0, balanced: 0.5, vivid: 1 }
  const files = {}
  for (const [combo, colours] of Object.entries(resolved)) {
    const [theme, expression] = combo.split('/')
    const x = X[expression]
    const color = Object.fromEntries(
      Object.entries(colours)
        .filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v))
        .map(([name, code]) => [
          name,
          {
            $value: {
              colorSpace: 'srgb',
              components: [1, 3, 5].map((i) => parseInt(code.slice(i, i + 2), 16) / 255),
              hex: code,
            },
          },
        ]),
    )
    files[`veneer.${theme}.${expression}.tokens.json`] = {
      color: { $type: 'color', ...color },
      space: {
        $type: 'dimension',
        ...Object.fromEntries(Object.entries(SPACE).map(([k, v]) => [k, px(v)])),
      },
      radius: {
        $type: 'dimension',
        mark: px(Math.round(4 - 2 * x)),
        control: px(Math.round(8 - 6 * x)),
        surface: px(Math.round(12 - 10 * x)),
      },
    }
  }
  // Each file is whole, so one modifier picks one file: the dials don't layer in DTCG terms.
  const contexts = Object.fromEntries(
    Object.keys(files).map((f) => [f.split('.').slice(1, 3).join('-'), [{ $ref: f }]]),
  )
  files['veneer.resolver.json'] = {
    name: 'veneer',
    version: '2025.10',
    modifiers: { mode: { contexts, default: 'light-balanced' } },
    resolutionOrder: [{ $ref: '#/modifiers/mode' }],
  }
  return files
}
