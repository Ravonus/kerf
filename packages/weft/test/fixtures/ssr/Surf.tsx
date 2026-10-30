import { defineSurface, Surface } from '../../../src/surface.tsx'

const Stars = defineSurface({ name: 'stars', kind: 'webgl2', setup() { throw new Error('never on the server') } })
const Pixel = defineSurface({ name: 'p', kind: 'canvas2d', pixel: { width: 256, height: 144 }, setup() {} })

export const Sized = () => <Surface use={Stars} aspect="16/9" label="Stars" />
export const Target = () => <Surface use={Pixel} label="Pixels" />
