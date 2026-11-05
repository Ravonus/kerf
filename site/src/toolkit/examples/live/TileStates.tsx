import { Grid, Tile } from '@weft-js/warp'
import { TILES } from './shared'

export const TileStates = () => (
  <Grid cols={3} gap="related" style="grid-auto-rows:168px;inline-size:100%">
    {TILES.map((p) => (
      <Tile key={p.id} p={p} />
    ))}
  </Grid>
)
