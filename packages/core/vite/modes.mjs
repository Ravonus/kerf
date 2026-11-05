export const MODE = /\?weft-(ssr|hydrate)$/

/** Carry an explicit SSR or hydration mode to first-party component imports. */
export const modeHooks = {
  async resolveId(source, importer) {
    const mode = importer && MODE.exec(importer)
    if (!mode || !(source.startsWith('.') || source.startsWith('@weft-js/'))) return null // first-party packages ship TSX
    const r = await this.resolve(source, importer.slice(0, mode.index), { skipSelf: true })
    return r && /\.[jt]sx$/.test(r.id) ? r.id + mode[0] : r
  },
}
