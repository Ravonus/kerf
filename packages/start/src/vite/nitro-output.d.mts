export function buildDate(value: string | undefined): string | undefined
export function normalizePublicAssets(code: string, date?: string): string
export function normalizeAssetManifest(code: string, keyFor: (path: string) => string): string
export function normalizeAssetLookup(code: string, keyFor: (path: string) => string): string
export function stableServices(code: string, directory: string): string
export function normalizeRouting(code: string, pathFor: (path: string) => string): string
export function normalizeServerAssets(code: string, date?: string): string
export function finalizeBuild(output: { dir: string }, date?: string): Promise<void>
