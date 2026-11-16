import { afterEach, expect, it, vi } from 'vitest'
import { supportsMediaStreaming, mediaHlsConfig } from '../src/media-streaming'
afterEach(() => vi.unstubAllGlobals())
it('uses a controlled stream when native HLS and MediaSource coexist', () => {
  vi.stubGlobal('MediaSource', Object)
  vi.stubGlobal('ManagedMediaSource', undefined)
  expect(supportsMediaStreaming()).toBe(true)
})
it('supports the managed media source without importing a player on native-only browsers', () => {
  vi.stubGlobal('MediaSource', undefined)
  vi.stubGlobal('ManagedMediaSource', undefined)
  expect(supportsMediaStreaming()).toBe(false)
  vi.stubGlobal('ManagedMediaSource', Object)
  expect(supportsMediaStreaming()).toBe(true)
})
it('requires display selection before loading and bounds gallery forward buffers', () => {
  expect(mediaHlsConfig.autoStartLoad).toBe(false)
  expect(mediaHlsConfig.testBandwidth).toBe(false)
  expect(mediaHlsConfig.maxMaxBufferLength).toBeLessThanOrEqual(4)
  expect(mediaHlsConfig.maxBufferSize).toBeLessThanOrEqual(1024 * 1024)
})
