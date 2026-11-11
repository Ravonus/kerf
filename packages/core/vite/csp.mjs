// Strict CSP: the stylesheets the compiler's `csp: 'strict'` output imports. Each is one generated class's rule,
// carried in its own id (`virtual:kerf/csp/<class>-<rule as hex>.css`), so nothing has to be kept between hooks and
// the same style anywhere in the app is one module.
const PREFIX = 'virtual:kerf/csp/'

/** The Vite hooks that serve the rules. */
export function cspStyles() {
  return {
    name: 'kerf:csp',
    resolveId(source) {
      return source.startsWith(PREFIX) ? '\0' + source : null
    },
    load(id) {
      if (!id.startsWith('\0' + PREFIX)) return null
      const hex = /-([0-9a-f]+)\.css$/.exec(id)?.[1]
      return hex ? Buffer.from(hex, 'hex').toString('utf8') + '\n' : null
    },
  }
}
