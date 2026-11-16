// Gallery playback must bound forward buffering even when the browser also advertises native HLS.
/** Shared HLS.js-compatible limits; segment boundaries may exceed the byte target. */
export const mediaHlsConfig = {
  autoStartLoad: false,
  startLevel: -1,
  testBandwidth: false,
  maxBufferLength: 2,
  maxMaxBufferLength: 4,
  maxBufferSize: 1024 * 1024,
  backBufferLength: 2,
  capLevelToPlayerSize: true,
  maxDevicePixelRatio: 1.75,
  abrEwmaDefaultEstimate: 500_000,
  enableWorker: true,
}
/** Check for controlled streaming before importing a player; it still qualifies its actual codecs. */
export function supportsMediaStreaming() {
  const browser = globalThis as typeof globalThis & { ManagedMediaSource?: unknown }
  return (
    typeof browser.MediaSource === 'function' || typeof browser.ManagedMediaSource === 'function'
  )
}
