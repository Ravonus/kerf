// `z.media()` (research 29 §6): the record of an upload or a CMS image, in the shape `<Media src>` already takes, so
// `<Media src={post.cover} alt="…" />` needs no conversion. Zod's `z` is an ES namespace and can't be extended, so this
// `z` is Zod's API plus `media()`.

import { z as zod } from 'zod'
import type { MediaAsset } from '@weft-js/core/media'

const record = () =>
  zod.object({
    kind: zod.enum(['photo', 'graphic', 'vector', 'video', 'audio']),
    src: zod.string(),
    width: zod.number().int().nonnegative(),
    height: zod.number().int().nonnegative(),
    type: zod.string(),
    sources: zod.array(zod.object({ type: zod.string(), srcset: zod.string() })),
    dominant: zod.string().optional(),
    placeholder: zod.string().optional(),
    name: zod.string(),
    quality: zod.enum(['ssimulacra2', 'fixed', 'original']).optional(),
    poster: zod.string().optional(),
    duration: zod.number().optional(),
    audio: zod.boolean().optional(),
    animated: zod.boolean().optional(),
    loop: zod.number().optional(),
    copy: zod.object({ src: zod.string(), type: zod.string(), bytes: zod.number().optional(), ratio: zod.number().optional() }).optional(),
    swap: zod.enum(['intent', 'idle', 'never']).optional(),
  })

export const z = { ...zod, media: record } as typeof zod & { media: typeof record }

export declare namespace z {
  export type infer<T> = zod.infer<T>
  export type input<T> = zod.input<T>
  export type output<T> = zod.output<T>
}

export type { MediaAsset }
