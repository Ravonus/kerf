// weft() for Vite 8: one filtered transform hook, so only .tsx/.jsx files cross into JS (§3.6).
import { createRequire } from 'node:module'

const { transform } = createRequire(import.meta.url)('./compiler.cjs')

export default function weft({ dev } = {}) {
  let isDev = false
  return {
    name: 'weft',
    enforce: 'pre',
    config(_, env) {
      isDev = dev ?? env.command === 'serve'
      return { oxc: { jsx: 'preserve' }, optimizeDeps: { rolldownOptions: { transform: { jsx: 'preserve' } } } }
    },
    transform: {
      filter: { id: /\.[jt]sx$/ },
      handler(code, id) {
        const out = transform(code, { filename: id.replace(/\?.*$/, ''), dev: isDev, sourceMap: true })
        for (const d of out.diagnostics) {
          const text = `${d.code} ${d.message}\n  help: ${d.help}`
          const loc = { file: id, line: d.line, column: d.column - 1 }
          if (d.severity === 'error') this.error({ message: text, loc })
          else this.warn({ message: text, loc })
        }
        return { code: out.code, map: out.map }
      },
    },
  }
}
