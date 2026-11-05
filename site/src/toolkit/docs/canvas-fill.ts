import type { ExampleRef } from '../types.ts'

export const fill = (id: string, title: string, height: number, note?: string): ExampleRef => ({
  id,
  title,
  stage: 'fill',
  height,
  note,
})
