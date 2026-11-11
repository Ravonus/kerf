import { PayError, type PayRail, type Product } from '../index'
import type { PayOptions } from '../server'

/** Keep one override and provider cache for this pay instance. */
export function makeRails<P extends Product>(
  options: PayOptions<P>,
  slot: () => Promise<{
    load: (key: string) => Promise<unknown>
    providers?: Record<string, unknown>
  }>,
) {
  let override: PayRail | undefined
  const rails = new Map<string, Promise<PayRail>>()

  async function railFor(key?: string): Promise<PayRail> {
    if (override) return override
    const { load, providers = {} } = await slot()
    const bound = Object.keys(providers).filter((k) => providers[k])
    if (!bound.length)
      throw new PayError(
        'P101',
        '`pay.rail` has no provider: add one to `plugins` in kerf.config.ts',
        500,
      )
    const pick = key ?? options.rail ?? (bound.length === 1 ? bound[0] : undefined)
    if (!pick || !bound.includes(pick))
      throw new PayError(
        'PAY022',
        pick
          ? `no rail \`${pick}\` is bound (${bound.join(', ')})`
          : `${bound.join(' and ')} are both bound: set \`rail\` in \`definePay\``,
        500,
      )
    let r = rails.get(pick)
    if (!r) rails.set(pick, (r = load(pick) as Promise<PayRail>))
    return r
  }

  return {
    railFor,
    use: (rail: PayRail | undefined) => {
      override = rail
    },
  }
}
