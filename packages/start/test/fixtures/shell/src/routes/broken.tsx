import { z } from 'zod'

export const routeData = { initial: z.null() }

export function load() {
  throw new Error('Private peer exception')
}

export default function Broken() {
  throw new Error('The broken loader must show the error view')
}
