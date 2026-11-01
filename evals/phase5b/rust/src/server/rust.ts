import { native } from '@weft/start/rust'

export const media = native('media')
export const impatient = native('media', { timeout: 200 })
