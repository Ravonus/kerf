import { native } from '@weft-js/start/rust'

export const media = native('media')
export const impatient = native('media', { timeout: 200 })
