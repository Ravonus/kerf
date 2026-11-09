// Optional peers load at the subpath so missing drivers report what to install.

const MISSING = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])

/** True when this failure is `pkg` itself not being there, not something inside it failing to load. */
const isMissing = (error: unknown, pkg: string) => {
  const { code = '', message } = (error ?? {}) as { code?: string; message?: unknown }
  return (
    (MISSING.has(code) ||
      /cannot find (module|package)|failed to (load|resolve)/i.test(String(message))) &&
    String(message).includes(pkg)
  )
}

/** `await driver('@weft-js/db/kysely', 'kysely', () => import('kysely'))`. The import stays literal so a bundler still sees it. */
export async function driver<T>(subpath: string, pkg: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (isMissing(error, pkg))
      throw new Error(
        `${subpath} needs the \`${pkg}\` driver, which isn't installed. Run: npm install ${pkg}`,
        { cause: error },
      )
    throw error
  }
}
