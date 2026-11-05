import { Textarea } from '@weft-js/warp'

export const TextareaCounter = () => (
  <Textarea
    label="Release note"
    counter={140}
    defaultValue="Product images now load from the edge, about 40% faster."
  />
)
