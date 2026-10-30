// A scope with a cookie box (research 29 §3): the server renders what the visitor chose.
import { defineState, state } from 'weft'

export const prefs = defineState('prefs', () => {
  const theme = state('light', { persist: 'cookie' })
  return { theme, toggle() { theme.value = theme.value === 'light' ? 'dark' : 'light' } }
})
