// @weft/ui-core/dither: dithering as plain TS (08 §6.7). tiles and quantize are pure and draw any tone to any palette; ramp
// reads inks from warp's tokens; field and image are the actions a binding attaches to a <canvas>.
export { tile, type Pattern, type Tile } from './tiles'
export { quantize, diffuse, levels, type Diffusion } from './quantize'
export { palette, rampInks, pack, tier, type Ramp, type Tone } from './ramp'
export { FIELDS, sample, stepFor, type Field, type FieldName } from './fields'
export { forces, type Forces, type PointerMode } from './pointer'
export { rasterMask, type Mask, type MaskSource } from './mask'
export { ditherField, fxState, type Fade, type FieldOptions } from './field'
export { ditherImage, tones, gradientTones, type Algorithm, type Gradient, type ImageOptions } from './image'
