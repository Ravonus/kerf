import { Canvas } from '../../src/Canvas'
import { Dither, DitherField, DitherGlyph } from '../../src/Dither'

export const Case = () => (
  <>
    <DitherField pointer="pull">
      <h2>Over the field</h2>
    </DitherField>
    <Dither src="/a.png" alt="A picture" />
    <DitherGlyph text="warp" />
    <Canvas
      draw={() => {
        throw new Error('ran on the server')
      }}
    />
  </>
)
