import { surfaceDocs } from './canvas-surfaces.ts'
import { ditherDocs } from './canvas-dither.ts'
import type { DocGroup } from '../types.ts'

export const canvas: DocGroup = {
  file: 'canvas',
  title: 'Canvas and dithering',
  intro:
    "Drawings that use Veneer's colours, follow the theme and pause off screen, up to whole pages painted on one canvas.",
  docs: [...surfaceDocs, ...ditherDocs],
}
