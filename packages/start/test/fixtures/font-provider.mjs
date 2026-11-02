// A `font.build@1` provider for the e2e fixture (test/dev-server.setup.mjs binds it through
// `.weft/slots/font.build.build.json`); @weft/text's own tests cover the real build.
export function createFontBuild() {
  return {
    async build({ url }) {
      const name = 'acme-400-latin-0123abcd.woff2'
      return {
        // Not the preloaded file, in a range nothing here uses: these bytes aren't a font, and Chrome would say so.
        css: `@font-face{font-family:"Acme";src:url(${url('never-' + name)}) format("woff2");font-display:swap;unicode-range:U+E000}\n`,
        preloads: [{ href: url(name), type: 'font/woff2' }],
        files: [{ name, bytes: new TextEncoder().encode('wOF2 fixture') }],
        metrics: {},
        report: {},
      }
    },
  }
}
