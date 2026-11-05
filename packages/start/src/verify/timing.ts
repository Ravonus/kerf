import type { Link, VerifyResult } from '../verify'
import { Broke, clean } from './support'

export function timer(ms: VerifyResult['ms']) {
  return async <T>(link: Link, run: () => Promise<T>): Promise<T> => {
    const t = performance.now()
    try {
      return await run()
    } catch (e) {
      throw e instanceof Broke ? e : new Broke(link, clean(e))
    } finally {
      ms[link] = Math.round(performance.now() - t)
    }
  }
}
