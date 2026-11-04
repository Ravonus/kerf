// The scopes of test/ssr-state.test.tsx, shared by the `?weft-ssr` and `?weft-hydrate` builds of Prefs.tsx.
import { defineState, state } from '@weft-js/core'

const object = {
  '~standard': {
    validate: (v: any) =>
      v && typeof v === 'object' && typeof v.n === 'number'
        ? { value: v }
        : { issues: [{ message: 'expected { n }' }] },
  },
}

export const prefs = defineState('prefs', () => {
  const theme = state('light', { persist: 'cookie' })
  const cart = state(
    { n: 0 },
    {
      persist: {
        in: 'cookie',
        schema: object,
        version: 2,
        migrate: { 1: (old: number) => ({ n: old }) },
      },
    },
  )
  const note = state('', { persist: 'local' })
  const label = state('init')
  return {
    theme,
    cart,
    note,
    label,
    setTheme(t: string) {
      theme.value = t
    },
    label2: () => label.value,
  }
})

export const odd = defineState('odd', () => ({ when: state<unknown>(null) }))
