import { state } from '@kerf-js/core'
import { Button, Card } from '@kerf-js/veneer'

export default function Account() {
  const signedIn = state(false)
  const receipts = 3
  return (
    <Card title="Your account">
      {signedIn.value ? (
        <p>Welcome back, Ana.</p>
      ) : (
        <p>Sign in to see your orders.</p>
      )}
      {signedIn.value && receipts > 0 && (
        <p>You have {receipts} new receipts.</p>
      )}
      <Button
        onClick={() => (signedIn.value = !signedIn.value)}
      >
        {signedIn.value ? 'Sign out' : 'Sign in'}
      </Button>
    </Card>
  )
}
