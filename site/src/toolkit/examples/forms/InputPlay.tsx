import { Input } from '@weft-js/warp'
import type { Knobs } from './shared'

export const InputPlay = (p: Knobs) => <Input {...p} hint={p.hint || undefined} />
