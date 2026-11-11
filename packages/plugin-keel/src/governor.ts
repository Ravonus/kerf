// The page's frame governor on KEEL's own modules: device-profile reads the device once, quality picks the level and
// its page levers from the tier and lowers the render scale while frames run slow; the tier sets the fps and ratio caps.
import type { Levers } from './scene'
import type { DeviceSignals, DeviceTier } from '../vendor/modules/device-profile.mjs'
import type { Quality } from '../vendor/modules/quality.mjs'

/** Options for `keelGovernor`. */
export interface GovernorOptions {
  /** The frame time to hold, in ms. Default 1000 / 60. */
  target?: number
  /** A recorded device instead of this browser's: a test, or a page that pins a tier. */
  signals?: DeviceSignals
}

/** A governor for `<Stage governor={...}>`. */
export interface KeelGovernor {
  start(): Promise<void>
  frame(ms: number): void
  readonly levers: Levers
  readonly fps: number
  pixelRatio(width: number): number
  /** The device's tier once `start` resolved; `high` before. */
  readonly tier: DeviceTier
}

/** Everything at full, until the device is read. */
const FULL: Levers = { renderScale: 1, bloom: 1, motes: 1, blendScale: 1, taa: true, density: 1 }

/** What each tier's frames may cost: low draws at 30 fps, and a narrower canvas on a weaker device. */
const PACE: Record<DeviceTier, { fps: number; widest: number }> = {
  high: { fps: 60, widest: 3840 },
  mid: { fps: 60, widest: 1920 },
  low: { fps: 30, widest: 1280 },
}

/**
 * The frame governor a stage asks each frame: `<Stage governor={keelGovernor()}>`. Its modules load in `start`.
 * The render scale is quality's, relative to where quality starts, so a device that keeps up draws at full scale.
 */
export function keelGovernor(options: GovernorOptions = {}): KeelGovernor {
  let tier: DeviceTier = 'high'
  let device = 2
  let quality: Quality | null = null
  let start = 1
  let levers = FULL
  return {
    async start() {
      const [profile, governor] = await Promise.all([
        import('../vendor/modules/device-profile.mjs'),
        import('../vendor/modules/quality.mjs'),
      ])
      const known = profile.profileOf(options.signals ?? profile.readSignals())
      tier = known.tier
      device = known.pixelRatio
      quality = governor.createQuality({ level: 'auto', tier, target: options.target ?? 1000 / 60 })
      start = quality.scale
      levers = { ...quality.levers, renderScale: 1 }
    },
    frame(ms) {
      if (!quality) return
      quality.frame(ms)
      const scale = Math.round((quality.scale / start) * 100) / 100
      if (scale !== levers.renderScale) levers = { ...levers, renderScale: scale }
    },
    get levers() {
      return levers
    },
    get fps() {
      return PACE[tier].fps
    },
    get tier() {
      return tier
    },
    pixelRatio: (width) => Math.min(device, 2, PACE[tier].widest / Math.max(width, 1)),
  }
}
