import type { ExampleRef } from '../../types.ts'

export const chart = (id: string, title: string, height = 420, note?: string): ExampleRef => ({
  id,
  title,
  stage: 'fill',
  height,
  note,
})
