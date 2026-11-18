export function manifestKey(pathFor: (path: string) => string, key: string): string
export function normalizeViteManifest(json: string, keyFor: (path: string) => string): string
export function normalizeCopiedMap(
  json: string,
  pathFor: (path: string) => string,
  file: string,
): string
