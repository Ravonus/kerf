/** media diagnostic entries in catalog order. */
export const media = [
  {
    code: 'M001',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'Raw `<img>`/`<video>` without `width`/`height` or `aspect-ratio`, outside a `<Boundary>` (inside it is X030)',
    fix: 'Insert the intrinsic `width`/`height` (autofix for an imported file), or use `<Media>`',
  },
  {
    code: 'M002',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: 'An image rendered through a `?url` import or a string path, bypassing the optimizer',
    fix: '`import x from \'./x.jpg?media\'` and `<Media src={x} alt="…" />`',
  },
  {
    code: 'M003',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'A raw `<img>` whose file is wider than its `width` × 2 (DPR) × 1.25: bytes nobody sees',
    fix: '`<Media>`, which resizes',
  },
  {
    code: 'M004',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: 'A GIF over 256 KB rendered raw',
    fix: '`<Media>` with `mediaFfmpeg()` in `plugins`, which turns GIFs into video when that saves 15%',
  },
  {
    code: 'M005',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      '`<video autoplay>` without `muted`: browsers block it, and sound before a gesture is hostile',
    fix: 'Add `muted` (autofix)',
  },
  {
    code: 'M006',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: '`<video>` without `poster`: a blank box until the first frame decodes',
    fix: 'Add a `poster` image',
  },
  {
    code: 'M007',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'Missing `alt` on `<Media>`/`<img>`, `<Media alt="">` without `decorative`, or `alt` equal to the file name',
    fix: 'Describe what the image shows; `alt="" decorative` for purely visual media',
  },
  {
    code: 'M008',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'A route\'s first media is `loading="lazy"`, or `priority` media is lazy: the likely LCP image loads late',
    fix: 'Mark the hero `priority` and drop `loading="lazy"`',
  },
  {
    code: 'M009',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: '`priority` on more than 2 media in one route: they compete for the first bytes',
    fix: 'Keep `priority` on the one hero image',
  },
  {
    code: 'M010',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'A `priority` `<Media>` without `width` or `sizes`: eager images can\'t use `sizes="auto"`, so the browser assumes 100vw',
    fix: 'Pass `width="1/2"` (a viewport fraction or CSS length) or `sizes`',
  },
  {
    code: 'M011',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      '`<video autoplay loop>` without `controls`, or a GIF in a raw `<img>`: endless motion with no pause (WCAG 2.2.2)',
    fix: '`<Media>` (pause control, poster under reduced motion), or add `controls`',
  },
  {
    code: 'M012',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      'An SVG with `<script>`, `foreignObject`, `on*=` handlers or external references, used as an image',
    fix: 'Sanitise the file; the build refuses to optimise it',
  },
  {
    code: 'M013',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: 'A file in `public/` referenced by string: untracked, unoptimised, no dimensions',
    fix: "Move it next to the code and `import x from './x.jpg?media'`",
  },
  {
    code: 'M014',
    severity: 'info',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: "What `encoder: 'compatible'` adds to the build for compatible copies",
    fix: 'Nothing: it says what the toggle costs',
  },
  {
    code: 'M015',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches: 'An HDR or over-8-bit video that comes out 8-bit SDR',
    fix: 'Convert the source on purpose, or accept the flattening',
  },
  {
    code: 'M016',
    severity: 'warning',
    by: 'plugin',
    owner: '@weft-js/plugin-media',
    catches:
      '`<Media src>` given a string: nothing knows its size before it loads, so the page shifts',
    fix: 'Import it with `?media`, or store what `ctx.media.ingest` returns and type the field `z.media()`',
  },
  {
    code: 'M017',
    severity: 'error',
    by: 'start',
    catches: '`ctx.media` or a `/_weft/m/` URL used with no `media.server` provider',
    fix: 'Add `media()` from `@weft-js/plugin-media` to `plugins` in weft.config.ts',
  },
  {
    code: 'M019',
    severity: 'error',
    by: 'plugin',
    owner: '@weft-js/plugin-media-ffmpeg',
    catches: 'ffmpeg did not run, is not the pinned binary, or has no encoder for a codec',
    fix: 'Install ffmpeg, or give `mediaFfmpeg({ binary })` its path',
  },
  {
    code: 'M018',
    severity: 'error',
    by: 'start',
    catches:
      "An upload refused: it isn't an image weft can read, or it's over the size limit (422)",
    fix: 'Raise `media({ server: { maxBytes } })`, or check the file on the client first',
  },
]
