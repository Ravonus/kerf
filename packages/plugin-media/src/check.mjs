// M001–M013 in `weft check` (research 15 §7.5; the static rules of research 26 §2.5). Runs as this plugin's `check`
// hook over the project's .tsx/.jsx files, with the JSX view `weft check` passes in `ctx`.
import { basename, dirname, extname, join, normalize } from 'node:path'
import { probe } from '@weft-js/core/media-probe'
import { unsafeSvg } from './svg.mjs'

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i
const MEDIA = new Set(['img', 'video', 'Media'])
const ROUTE = /(^|\/)src\/routes\//

const rel = (from, spec) =>
  normalize(join(dirname(from), spec))
    .split('\\')
    .join('/')

function checkSource({ el, src, size, sized, raw, report }) {
  // M016: a string has no dimensions until it loads
  if (!raw && (src?.kind === 'string' || /^[`'"]/.test(src?.expr ?? '')))
    report(
      'M016',
      el,
      '`<Media src>` is a string, so nothing knows its size before it loads and the page shifts.',
      {
        description:
          'Import it with `?media`, or store the record `ctx.media.ingest` returns and type the field `z.media()`',
        safe: false,
      },
    )

  // M001: raw media with no box (X030 covers it inside a Boundary)
  if (raw && !sized && !el.ancestors.includes('Boundary')) {
    report(
      'M001',
      el,
      `<${el.name}> has no \`width\`/\`height\` or \`aspect-ratio\`: it renders 0 px tall and pushes the page down when it loads.`,
      size
        ? {
            description: `Insert the file's size (${size.width}×${size.height})`,
            safe: true,
            edits: [
              {
                start: el.tagEnd,
                end: el.tagEnd,
                text: ` width={${size.width}} height={${size.height}}`,
              },
            ],
          }
        : undefined,
    )
  }
}

function checkImport({ el, a, src, imp, spec, query, target, size, ctx, file, report }) {
  // M002: through Vite's URL import or a string path to a project file
  if (el.name === 'img' && imp && IMAGE.test(spec) && query !== 'media') {
    report(
      'M002',
      el,
      `\`${imp.source}\` is the untouched file: no resizing, no AVIF, no placeholder.`,
      {
        description: 'Use ?media and <Media>',
        safe: false,
        edits: [
          { start: imp.start, end: imp.end, text: `import ${imp.local} from '${spec}?media'` },
        ],
      },
    )
  } else if (
    el.name === 'img' &&
    src?.kind === 'string' &&
    !/^(https?:|data:|\/\/)/.test(src.value) &&
    !src.value.startsWith('/') &&
    IMAGE.test(src.value) &&
    ctx.exists(rel(file, src.value))
  ) {
    report(
      'M002',
      el,
      `\`${src.value}\` is a project file referenced by string: no resizing, no AVIF, no dimensions.`,
    )
  }
  // M003: oversize for its rendered width
  const w = Number(a('width')?.value ?? a('width')?.expr)
  if (el.name === 'img' && size && w > 0 && size.width > w * 2 * 1.25) {
    report(
      'M003',
      el,
      `${basename(target)} is ${size.width} px wide for a ${w} px slot: ${Math.round((size.width / (w * 2)) * 100) / 100}× what a 2× screen needs.`,
    )
  }
}

function checkMotion({ el, a, src, target, bytes, gifLimit, report }) {
  // M004 and M011: GIFs in raw <img>
  const gif =
    (target && /\.gif$/i.test(target)) || (src?.kind === 'string' && /\.gif$/i.test(src.value))
  if (el.name === 'img' && gif && bytes && bytes.length > gifLimit)
    report('M004', el, `${basename(target)} is ${Math.round(bytes.length / 1024)} KB of GIF.`)
  if (el.name === 'img' && gif)
    report(
      'M011',
      el,
      'An animated GIF in a raw <img> loops forever with no pause control (WCAG 2.2.2).',
    )
  // M005, M006, M011: video
  if (el.name === 'video') {
    if (a('autoplay') && !a('muted'))
      report(
        'M005',
        el,
        '<video autoplay> without `muted`: browsers block it, and sound before a gesture is hostile.',
        {
          description: 'Add muted',
          safe: true,
          edits: [{ start: el.tagEnd, end: el.tagEnd, text: ' muted' }],
        },
      )
    if (!a('poster'))
      report('M006', el, '<video> without `poster` is a blank box until its first frame decodes.')
    if (a('autoplay') && a('loop') && !a('controls'))
      report(
        'M011',
        el,
        '<video autoplay loop> without `controls` moves forever with no way to pause it (WCAG 2.2.2).',
      )
  }
}

function checkAlt({ el, a, src, imp, target, report }) {
  // M007: alt
  if (el.name !== 'video') {
    const alt = a('alt')
    const stems = [
      imp?.local,
      target && basename(target),
      target && basename(target, extname(target)),
      src?.kind === 'string' && basename(src.value),
    ]
      .filter(Boolean)
      .map((s) => s.toLowerCase())
    if (!alt) report('M007', el, `<${el.name}> has no \`alt\`.`)
    else if (el.name === 'Media' && alt.kind === 'string' && alt.value === '' && !a('decorative'))
      report(
        'M007',
        el,
        '`alt=""` hides the image from screen readers: say so with `decorative`, or describe it.',
      )
    else if (alt.kind === 'string' && alt.value && stems.includes(alt.value.toLowerCase()))
      report(
        'M007',
        el,
        `\`alt="${alt.value}"\` is the file name, which tells nobody what the image shows.`,
      )
  }
}

function checkPriority({ el, a, route, i, priorities, report }) {
  // M008, M009, M010: priority (route files: the likely LCP image)
  const lazy = a('loading')?.value === 'lazy'
  const priority = !!a('priority') || a('fetchpriority')?.value === 'high'
  if (priority && lazy)
    report('M008', el, '`priority` media with `loading="lazy"` loads late anyway.', {
      description: 'Remove loading="lazy"',
      safe: true,
      edits: [{ start: a('loading').start - 1, end: a('loading').end, text: '' }],
    })
  else if (route && i === 0 && lazy)
    report(
      'M008',
      el,
      `The route's first media is \`loading="lazy"\`: it is the likely LCP image, and lazy delays it.`,
    )
  if (route && priority && ++priorities > 2) {
    const p = a('priority') ?? a('fetchpriority')
    report(
      'M009',
      el,
      `More than 2 \`priority\` media in this route: they compete for the first bytes.`,
      {
        description: 'Remove priority',
        safe: true,
        edits: [{ start: p.start - 1, end: p.end, text: '' }],
      },
    )
  }
  if (el.name === 'Media' && a('priority') && !a('width') && !a('sizes'))
    report(
      'M010',
      el,
      '`priority` makes this image eager, and eager images can\'t use `sizes="auto"`: the browser assumes 100vw and fetches the largest file.',
    )
  return priorities
}

function checkSecurity({ el, src, target, bytes, svgs, ctx, report }) {
  // M012: unsafe SVG used as an image
  if (target && /\.svg$/i.test(target) && bytes) {
    if (!svgs.has(target)) svgs.set(target, unsafeSvg(new TextDecoder().decode(bytes)))
    if (svgs.get(target).length)
      report('M012', el, `${basename(target)} has ${svgs.get(target).join(', ')}.`)
  }
  // M013: public/ by string
  if (
    src?.kind === 'string' &&
    src.value.startsWith('/') &&
    !src.value.startsWith('//') &&
    ctx.exists(`public${src.value.split('?')[0]}`)
  ) {
    report(
      'M013',
      el,
      `\`${src.value}\` is served from public/: untracked, unoptimised, with no dimensions.`,
    )
  }
}

/** @param {{ files: string[], read: (f: string) => string, jsx: Function, importOf: Function, exists: (f: string) => boolean, bytes: (f: string) => Uint8Array | undefined }} ctx */
export function checkMedia(ctx, { gifLimit = 256 * 1024 } = {}) {
  const out = []
  const svgs = new Map()
  for (const file of ctx.files) {
    if (!/\.[jt]sx$/.test(file)) continue
    const scan = ctx.jsx(file)
    const report = (code, el, why, fix) =>
      out.push({ code, file, start: el.start, end: el.tagEnd, why, ...(fix && { fix }) })
    const media = scan.elements.filter((e) => MEDIA.has(e.name))
    const route = ROUTE.test(file)
    let priorities = 0

    for (const [i, el] of media.entries()) {
      const a = (n) => el.attr(n)
      const src = a('src')
      const imp = src?.kind === 'expr' ? ctx.importOf(scan, src.expr) : undefined
      const [spec, query = ''] = imp ? imp.source.split('?') : []
      const target = imp && spec.startsWith('.') ? rel(file, spec) : undefined
      const bytes = target && IMAGE.test(target) ? ctx.bytes(target) : undefined
      const size = bytes && probe(bytes, target)
      const style = a('style')?.value ?? a('style')?.expr ?? ''
      const sized = (a('width') && a('height')) || /aspect-?ratio/i.test(style)
      const raw = el.name !== 'Media'

      checkSource({ el, src, size, sized, raw, report })
      checkImport({ el, a, src, imp, spec, query, target, size, ctx, file, report })
      checkMotion({ el, a, src, target, bytes, gifLimit, report })
      checkAlt({ el, a, src, imp, target, report })
      priorities = checkPriority({ el, a, route, i, priorities, report })
      checkSecurity({ el, src, target, bytes, svgs, ctx, report })
    }
  }
  return out
}
