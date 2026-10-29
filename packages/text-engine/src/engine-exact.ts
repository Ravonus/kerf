// Gecko's provider: the exact tier in the base chunk, no lite tier. The lite tier reuses Pretext's Blink and
// WebKit break scans and their measurement rules; Gecko's (ICU4X segmentation, its own space and emoji
// handling) has no lite twin yet, so Firefox gets specialised Pretext eagerly.
import { exact } from './exact.js'
import type { Pack, TextEngine } from './types.js'

declare const __ENGINE__: 'blink' | 'webkit' | 'gecko'

export const engine: TextEngine = {
  engine: __ENGINE__,
  prepare: exact.prepare,
  layout: exact.layout,
  lines: exact.lines,
  lineText: exact.lineText,
  clear: exact.clear,
  needs: exact.needs,
  load: packs => exact.load(packs.filter((p): p is Exclude<Pack, 'exact'> => p !== 'exact')),
  loaded: () => ['exact', ...exact.loaded()],
  setLocale: exact.setLocale,
}
