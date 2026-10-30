// `z.media()` (research 29 §6): the record of an upload or a CMS image, in the shape `<Media src>` already takes, so
// `<Media src={post.cover} alt="…" />` needs no conversion. Zod's `z` is an ES namespace and can't be extended, so this
// `z` is Zod's API plus `media()`.

import { z as zod } from 'zod'
import type { MediaAsset } from 'weft/media'

const record = () =>
  zod.object({
    kind: zod.enum(['photo', 'graphic', 'vector']),
    src: zod.string(),
    width: zod.number().int().positive(),
    height: zod.number().int().positive(),
    type: zod.string(),
    sources: zod.array(zod.object({ type: zod.string(), srcset: zod.string() })),
    dominant: zod.string().optional(),
    placeholder: zod.string().optional(),
    name: zod.string(),
    quality: zod.enum(['ssimulacra2', 'fixed', 'original']).optional(),
  })

export const z = { ...zod, media: record } as typeof zod & { media: typeof record }

export declare namespace z {
  export type infer<T> = zod.infer<T>
  export type input<T> = zod.input<T>
  export type output<T> = zod.output<T>
}

export type { MediaAsset }
