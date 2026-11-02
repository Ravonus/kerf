// The layout engine from the user agent, as Pretext's getLayoutEngine() reads it (src/measurement.ts):
// Firefox/ is Gecko; AppleWebKit/537.36 is Blink (Chrome/ or Chromium/ beside it, else unknown, which
// Pretext lays out as Blink); any other AppleWebKit/ is WebKit (Safari, and every iOS browser).
export type EngineName = 'blink' | 'webkit' | 'gecko'
export function detectEngine(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent ?? ''): EngineName {
  if (ua.includes('Firefox/')) return 'gecko'
  if (ua.includes('AppleWebKit/537.36')) return 'blink'
  return ua.includes('AppleWebKit/') ? 'webkit' : 'blink'
}
