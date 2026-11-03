import { derived, state } from '@weft-js/core'
import { Button, Card } from '@weft-js/warp'

// Percent off, by code. The subtotal is fixed so the totals are easy to check.
const CODES: Record<string, number> = { SAVE10: 10, HALF: 50 }
const SUBTOTAL = 40

export default function Coupon() {
  const code = state('')
  const applied = state('')
  const error = state('')
  const off = derived(() => CODES[applied.value] ?? 0)
  const total = derived(() => SUBTOTAL - (SUBTOTAL * off.value) / 100)

  const apply = () => {
    const typed = code.value.trim().toUpperCase()
    if (typed in CODES) {
      applied.value = typed
      error.value = ''
    } else {
      error.value = `${typed || 'An empty code'} isn't a code we know`
    }
  }

  return (
    <Card title="Your basket">
      <label>
        Coupon <input value={code.value} onInput={e => (code.value = e.currentTarget.value)} />
      </label>
      <Button onClick={apply}>Apply</Button>
      {error.value && <p role="alert">{error.value}</p>}
      <p role="status">Total: ${total.value.toFixed(2)}</p>
    </Card>
  )
}
