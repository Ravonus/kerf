// specialize.mjs: functions the lazy packs provide, by name.
export const __packs: Record<string, any> = {}
export class PackMissing extends Error {
  constructor(readonly pack: string, fn: string) { super(`text-engine: "${pack}" pack not loaded (needed by ${fn})`) }
}
export function __missing(pack: string, fn: string): never { throw new PackMissing(pack, fn) }
