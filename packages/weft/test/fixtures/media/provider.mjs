// A fake `media.build@1` provider for test/media.test.tsx: two widths, AVIF plus the source format.
export function createMediaBuild(options) {
  return {
    async build({ file, bytes }, ctx) {
      const name = file.split('/').pop()
      return {
        asset: {
          kind: 'photo',
          src: 'hero-640.jpg',
          width: 640,
          height: 480,
          type: 'image/jpeg',
          name,
          quality: 'ssimulacra2',
          sources: [
            { type: 'image/avif', srcset: 'hero-320.avif 320w, hero-640.avif 640w' },
            { type: 'image/jpeg', srcset: 'hero-320.jpg 320w, hero-640.jpg 640w' },
          ],
          dominant: '#336699',
          placeholder: 'data:image/webp;base64,AAAA',
        },
        files: ['hero-320.avif', 'hero-640.avif', 'hero-320.jpg', 'hero-640.jpg'].map((n) => ({
          name: n,
          bytes: new Uint8Array([bytes.length]),
        })),
        diagnostics: options.warn
          ? [
              {
                code: 'M004',
                severity: 'warning',
                message: `${name} is large (${ctx.dev ? 'dev' : 'build'})`,
              },
            ]
          : [],
      }
    },
  }
}

/** A fake `font.build@1` provider. */
export function createFontBuild({ family }) {
  return {
    async build(input) {
      return {
        css: `@font-face{font-family:"${family}";src:url(${input.url('f-latin.woff2')}) format("woff2")}`,
        preloads: [{ href: input.url('f-latin.woff2'), type: 'font/woff2' }],
        files: [{ name: 'f-latin.woff2', bytes: new Uint8Array([1, 2, 3]) }],
        metrics: { [family]: { capHeight: 0.7 } },
        report: { preloadBytes: 3 },
      }
    },
  }
}
