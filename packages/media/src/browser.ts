/** Network-aware playback and bounded, cancellable background start warming. */
export {
  mediaConnection,
  slowMediaConnection,
  mediaBandwidth,
  initialMediaLevel,
} from './media-network'
export type { MediaConnection } from './media-network'
export { warmMediaStarts } from './media-warm'
export type { MediaWarmTarget, MediaWarmOptions } from './media-warm'
