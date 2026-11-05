import type { ExampleRef } from '../../types.ts'

export const field = (id: string, title: string, note?: string, height?: number): ExampleRef => ({
  id,
  title,
  stage: 'narrow',
  note,
  height,
})
