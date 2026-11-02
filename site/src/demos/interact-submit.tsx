import { state } from '@weft-js/core'
import { Button, Card, Input, Spinner } from '@weft-js/warp'

// Stands in for a request to a server.
const send = (email: string) => new Promise<string>(done => { setTimeout(() => done(email), 800) })

export default function Newsletter() {
  const sending = state(false)
  const joined = state<string | null>(null)
  const join = async (email: string) => {
    sending.value = true
    joined.value = await send(email)
    sending.value = false
  }
  const submit = (e: SubmitEvent & { currentTarget: HTMLFormElement }) => {
    // Without this the browser would post the form and load a new page.
    e.preventDefault()
    const email = new FormData(e.currentTarget).get('email')
    if (typeof email === 'string') void join(email)
  }
  return (
    <Card title="Newsletter">
      {joined.value
        ? <p>Thanks, {joined.value} is on the list.</p>
        : (
          <form onSubmit={submit}>
            <Input label="Email" name="email" type="email" required disabled={sending.value} />
            <Button type="submit" disabled={sending.value}>
              {sending.value ? <Spinner /> : 'Join'}
            </Button>
          </form>
        )}
    </Card>
  )
}
