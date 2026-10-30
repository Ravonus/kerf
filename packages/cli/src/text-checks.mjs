// Phase 2's X-codes in `weft check` (research 11 §8.5, research 26 §7): responsive type and zoom (X005, X006, X008),
// the font build (X020–X023) and media inside query boundaries (X030, X034). X031 is measured at runtime by
// <Boundary> in dev. Reads .css and .html files and the JSX of the checked files; X022 also reads the font build's
// report in `.weft/fonts.json`.

import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { diagnostic, positions } from './diag.mjs'
import { discover } from './files.mjs'
import { scanJsx } from './jsx-scan.mjs'

const FLUID = /(-?[\d.]+)(vw|vi|cqi|cqw|vmin|vmax)\b/
const MAX_RATIO = 2.5

/** Comments blanked out, so offsets stay those of the file. */
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))

/** `clamp(rem, rem + cqi, rem)` for a viewport/container-only size, from its px at 375 and 1280 (ratio ≤ 2.5). */
export function fluidFor(n) {
  const at = w => (n * w) / 100
  const min = at(375)
  const max = Math.min(at(1280), min * MAX_RATIO)
  const slope = (max - min) / (1280 - 375)
  const r = x => Math.round(x * 1000) / 1000
  return `clamp(${r(min / 16)}rem, calc(${r((min - slope * 375) / 16)}rem + ${r(slope * 100)}cqi), ${r(max / 16)}rem)`
}

/** X005/X006 for one `font-size` value; `at` is its offset in the file. */
function fontSize(value, at, report) {
  if (/var\(/.test(value)) return // tokens: checked where they're defined
  const fluid = FLUID.exec(value)
  if (fluid && !/rem\b/.test(value)) {
    const only = new RegExp(`^\\s*${fluid[0].replace(/[.]/g, '\\.')}\\s*$`).test(value)
    report('X005', at, at + value.length, `\`font-size: ${value.trim()}\` scales with the ${fluid[2].startsWith('c') ? 'container' : 'viewport'} only: browser zoom and the user's font size don't change it (WCAG 1.4.4).`,
      only ? { description: 'Use a fluid clamp with rem ends', safe: false, text: fluidFor(Number(fluid[1])) } : undefined)
  }
  const clamp = /^\s*clamp\(\s*([\d.]+)(rem|px)\s*,[\s\S]*,\s*([\d.]+)(rem|px)\s*\)\s*$/.exec(value)
  if (clamp && clamp[2] === clamp[4] && Number(clamp[1]) > 0) {
    const ratio = Number(clamp[3]) / Number(clamp[1])
    if (ratio > MAX_RATIO) report('X006', at, at + value.length, `This fluid size grows ${ratio.toFixed(2)}× from its minimum to its maximum; above 2.5×, 200% zoom no longer doubles the text (WCAG 1.4.4).`)
  }
}

const faceFamily = body => /font-family\s*:\s*(['"]?)([^;'"]+)\1/.exec(body)?.[2].trim()

/** Every `@font-face` in a CSS text: family, body and offsets. */
function faces(css) {
  const out = []
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) out.push({ family: faceFamily(m[1]), body: m[1], start: m.index, bodyStart: m.index + m[0].indexOf('{') + 1, end: m.index + m[0].length })
  return out
}

/**
 * @param {string} root
 * @param {{ files: { rel: string, text: string }[], exclude?: string[], fontBuild?: boolean }} options files: the checked .tsx/.jsx files
 */
export function textChecks(root, { files, exclude = [], fontBuild = false }) {
  const out = []
  const sheets = discover(root, { include: ['**/*.css'], exclude }).map(rel => ({ rel, text: readFileSync(join(root, rel), 'utf8') }))
  const pages = discover(root, { include: ['**/*.html'], exclude }).map(rel => ({ rel, text: readFileSync(join(root, rel), 'utf8') }))
  const fontsJson = join(root, '.weft', 'fonts.json')
  const built = existsSync(fontsJson) ? JSON.parse(readFileSync(fontsJson, 'utf8')) : null

  const reporter = file => {
    const pos = positions(file.text)
    /** `fix.at`: the replaced range when it isn't the flagged one. */
    return (code, start, end, why, fix) => {
      const [a, b] = fix?.at ?? [start, end]
      out.push(diagnostic({ code, file: file.rel, span: pos.span(start, end), offset: [start, end], why, fix: fix && { description: fix.description, safe: fix.safe, edits: [{ file: file.rel, span: pos.span(a, b), offset: [a, b], text: fix.text }] } }))
    }
  }

  // -- CSS: font sizes and font faces --
  const allFaces = sheets.flatMap(s => faces(stripComments(s.text)).map(f => ({ ...f, sheet: s })))
  const families = new Set(allFaces.map(f => f.family).filter(Boolean))
  const faceUrls = new Set(allFaces.flatMap(f => [...f.body.matchAll(/url\(\s*['"]?([^'")]+)/g)].map(m => basename(m[1].split('?')[0]))))
  for (const s of sheets) {
    const css = stripComments(s.text)
    const report = reporter(s)
    for (const m of css.matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)) fontSize(m[1], m.index + m[0].indexOf(m[1], m[0].indexOf(':')), report)
    for (const f of faces(css)) {
      const display = /font-display\s*:\s*(block|auto)\b/.exec(f.body)
      if (display) {
        const at = f.bodyStart + display.index + display[0].lastIndexOf(display[1])
        report('X021', at, at + display[1].length, `\`font-display: ${display[1]}\` hides text for up to 3 s while the font loads; with a matched fallback face, \`swap\` shifts nothing.`, { description: 'Use swap', safe: true, text: 'swap' })
      }
      const local = /url\(\s*['"]?(?!https?:|data:)/.test(f.body)
      if (!local || !f.family || /Fallback$/.test(f.family)) continue
      if (!families.has(`${f.family} Fallback`)) {
        const how = fontBuild ? 'declare it in `text({ fonts })`, which generates the fallback' : 'add `@weft/plugin-text` and declare it in `text({ fonts })`'
        report('X020', f.start, f.start + '@font-face'.length, `\`@font-face\` for "${f.family}" has no "${f.family} Fallback" face: the swap from the system font shifts layout. Fix: ${how}.`)
      }
      if (!/unicode-range\s*:/.test(f.body)) report('X022', f.start, f.start + '@font-face'.length, `"${f.family}" ships the whole font file: no \`unicode-range\`, so it isn't subset.`)
    }
  }
  for (const [code, why] of built?.report?.overBudget ?? []) {
    if (code === 'X022') out.push(diagnostic({ code: 'X022', file: '.weft/fonts.json', why }))
  }

  // -- Markup: viewport meta, font preloads, media in boundaries, pending timers --
  const viewport = (file, start, end, content, valueStart) => {
    const parts = content.split(',').map(s => s.trim()).filter(Boolean)
    const bad = parts.filter(p => /^user-scalable\s*=\s*(no|0)$/i.test(p) || (/^maximum-scale\s*=/i.test(p) && parseFloat(p.split('=')[1]) < 2))
    if (!bad.length) return
    const keep = parts.filter(p => !bad.includes(p)).join(', ')
    reporter(file)('X008', start, end, `The viewport meta blocks zoom (\`${bad.join('`, `')}\`): people who need larger text can't pinch to get it (WCAG 1.4.4).`,
      { description: 'Remove the zoom limits', safe: true, text: keep, at: [valueStart, valueStart + content.length] })
  }
  for (const p of pages) {
    for (const m of p.text.matchAll(/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/gi)) {
      const c = /content\s*=\s*(["'])([^"']*)\1/i.exec(m[0])
      if (c) viewport(p, m.index, m.index + m[0].length, c[2], m.index + c.index + c[0].indexOf(c[2]))
    }
    for (const m of p.text.matchAll(/<link\b[^>]*rel\s*=\s*["']preload["'][^>]*>/gi)) {
      if (/\bas\s*=\s*["']font["']/i.test(m[0])) preload(p, /href\s*=\s*["']([^"']+)/i.exec(m[0])?.[1], m.index, m.index + m[0].length)
    }
  }

  /** X023: a font preload no `@font-face` uses (the font build's own preloads live under its asset URLs). */
  function preload(file, href, start, end) {
    if (href && !faceUrls.has(basename(href.split('?')[0])) && !href.includes('@weft-assets') && !href.startsWith('/assets/')) {
      reporter(file)('X023', start, end, `This preloads \`${href}\`, which no \`@font-face\` uses: the bytes compete with the page's own critical requests.`)
    }
  }

  for (const f of files) {
    if (!/\.[jt]sx$/.test(f.rel)) continue
    let scan
    try {
      scan = scanJsx(f.text, f.rel)
    } catch {
      continue // syntax errors are W000's
    }
    const report = reporter(f)
    for (const el of scan.elements) {
      const style = el.attr('style')
      if (style) {
        if (style.kind === 'string') for (const m of style.value.matchAll(/font-size\s*:\s*([^;]+)/g)) fontSize(m[1], style.valueStart + 1 + m.index + m[0].indexOf(m[1]), report)
        else for (const m of (style.expr ?? '').matchAll(/fontSize\s*:\s*(['"`])([^'"`]+)\1/g)) fontSize(m[2], style.valueStart + m.index + m[0].indexOf(m[2]), report)
      }
      if (el.name === 'meta' && el.attr('name')?.value === 'viewport' && el.attr('content')?.kind === 'string') {
        const c = el.attr('content')
        viewport(f, el.start, el.end, c.value, c.valueStart + 1)
      }
      if (el.name === 'link' && el.attr('rel')?.value === 'preload' && el.attr('as')?.value === 'font') {
        preload(f, el.attr('href')?.value, el.start, el.end)
      }
      if (['img', 'video', 'iframe'].includes(el.name) && el.ancestors.includes('Boundary')) {
        const sized = (el.attr('width') && el.attr('height')) || /aspect-?ratio/i.test(style?.value ?? style?.expr ?? '')
        if (!sized) report('X030', el.start, el.tagEnd, `<${el.name}> inside a <Boundary> has no \`width\`/\`height\` or \`aspect-ratio\`: it renders 0 px tall, then pushes the content down when it loads.`)
      }
      const pending = el.name === 'Boundary' && el.attr('pending')
      if (pending?.kind === 'expr') {
        const tag = /^<\s*([A-Z][\w.]*)/.exec(pending.expr)?.[1]
        const timers = /\b(setTimeout|setInterval)\s*\(/
        if (timers.test(pending.expr) || (tag && timers.test(scan.functions.get(tag) ?? ''))) {
          report('X034', pending.start, pending.end, `This \`pending\` fallback${tag ? ` (<${tag}>)` : ''} runs its own timers: <Boundary> already waits 150 ms before showing it and holds it 400 ms, and a second clock makes it flash.`)
        }
      }
    }
  }
  return out
}
