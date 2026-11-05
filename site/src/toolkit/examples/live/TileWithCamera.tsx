import { Tile } from '@weft-js/warp'
import { CALL_SELF } from '../../world'

export const TileWithCamera = () => (
  <div style="block-size:220px;inline-size:320px;display:grid">
    <Tile
      p={CALL_SELF}
      self
      video={() => (
        <img
          alt=""
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'%3E%3Crect width='16' height='9' fill='%23345'/%3E%3Ccircle cx='8' cy='4' r='2' fill='%2389a'/%3E%3C/svg%3E"
        />
      )}
    />
  </div>
)
