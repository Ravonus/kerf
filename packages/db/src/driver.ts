// Each driver is an optional peer: nobody installs Prisma or Mongo to use SQLite. A subpath that needs one loads it here,
// at the top of its own module, so a missing driver says what to install instead of failing somewhere in a bundle.

const MISSING = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])

/** True when this failure is `pkg` itself not being there, not something inside it failing to load. */
const isMissing = (error: any, pkg: string) => (MISSING.has(error?.code) || /cannot find (module|package)|failed to (load|resolve)/i.test(String(error?.message))) && String(error?.message).includes(pkg)

/** `await driver('@weft/db/kysely', 'kysely', () => import('kysely'))`. The import stays literal so a bundler still sees it. */
export async function driver<T>(subpath: string, pkg: string, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    if (isMissing(error, pkg)) throw new Error(`${subpath} needs the \`${pkg}\` driver, which isn't installed. Run: npm install ${pkg}`, { cause: error })
    throw error
  }
}
