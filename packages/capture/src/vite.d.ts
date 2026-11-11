import type { Plugin } from 'vite'
import type { BakeManifest } from './index'

/** A Vite plugin: `import 'virtual:weft/posters'` registers the posters a bake wrote in `dir` (default `posters`). */
export declare function posters(options?: { dir?: string }): Plugin
/** The source of the posters module for a manifest in `folder`, or of an empty one. */
export declare function postersModule(folder: string, manifest: BakeManifest | null): string
