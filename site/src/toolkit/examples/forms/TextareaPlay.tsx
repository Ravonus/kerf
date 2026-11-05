import { Textarea } from '@weft-js/warp'
import type { Knobs } from './shared'

export const TextareaPlay = (p: Knobs) => <Textarea {...p} hint={p.hint || undefined} />
