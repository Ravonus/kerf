// Image playback must beat the measured native winner after fallback, manifest and player byte costs.
import { frameVideo } from './frames.mjs'
import { nativeVideo } from './video-native.mjs'

const IMAGE_PLAYER_BUDGET = 64 * 1024

function cost(output) {
  const { asset, files } = output
  if (!asset) return null
  const original = asset.original.src,
    added = files
      .filter((file) => file.name !== original && file.name !== asset.poster)
      .reduce((total, file) => total + file.bytes.length, 0),
    encodedBytes = asset.frames ? added : output.verification.playbackBytes,
    manifestBytes = new TextEncoder().encode(JSON.stringify(asset)).length,
    runtimeBudgetBytes = asset.frames ? IMAGE_PLAYER_BUDGET : 0
  return {
    encodedBytes,
    addedStorageBytes: added,
    manifestBytes,
    runtimeBudgetBytes,
    comparisonBytes: encodedBytes + manifestBytes + runtimeBudgetBytes,
    decodeCpu: 'unmeasured',
  }
}

/** Native wins ties; image frames need both a smaller payload and a lower conservative delivery byte cost. */
export function selectVideoDelivery(native, frames) {
  const videoCost = cost(native),
    frameCost = frames?.asset?.frames ? cost(frames) : null,
    selected =
      frameCost &&
      frameCost.encodedBytes < videoCost.encodedBytes &&
      frameCost.comparisonBytes < videoCost.comparisonBytes
        ? frames
        : native,
    selectedCost = selected === frames ? frameCost : videoCost
  return {
    ...selected,
    diagnostics: [
      ...native.diagnostics,
      ...(frames?.diagnostics ?? []).map((diagnostic) => ({
        ...diagnostic,
        severity: diagnostic.severity === 'error' ? 'info' : diagnostic.severity,
      })),
    ],
    verification: {
      ...selected.verification,
      nativeCandidates: native.verification.nativeCandidates,
      selected: selected === frames ? 'frames' : native.verification.selected,
      selection: {
        model: 'encoded bytes plus manifest and image-player budget',
        native: videoCost,
        frames: frameCost,
        selected: selectedCost,
        reason:
          selected === frames
            ? 'smaller payload and lower delivery byte cost'
            : 'native playback is cheaper, tied, or image playback did not qualify',
      },
    },
  }
}

/** Automatic playback evaluates native first, then bounds image work by that actual winning payload. */
export async function autoVideo(source, o, encode, scorer) {
  const native = await nativeVideo(source, o, encode, scorer)
  if (!native) return frameVideo(source, { ...o, frameScorer: scorer }, encode)
  if (native.verification.framesEligible === false) return selectVideoDelivery(native)
  const budget = Math.min(
    o.video.maxFrameBytes ?? 256 * 1024 * 1024,
    native.verification.playbackBytes,
  )
  const frames = await frameVideo(
    source,
    { ...o, frameScorer: scorer, video: { ...o.video, maxFrameBytes: budget } },
    encode,
  ).catch((error) => ({
    diagnostics: [
      {
        code: 'M020',
        severity: 'info',
        message: `${source.name}: ${error.message}; native playback retained.`,
      },
    ],
  }))
  return selectVideoDelivery(native, frames)
}
