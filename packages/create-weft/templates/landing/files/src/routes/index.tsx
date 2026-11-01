import { Form, type FormApi, type Meta } from '@weft/start'
import { Button, Input } from '@weft/warp'
import { joinWaitlist } from '#/server/waitlist'

export const meta: Meta = { title: { absolute: 'Landing' } }

export default function Home() {
  return (
    <Form of={joinWaitlist}>
      {(form: FormApi) => (
        <>
          <Input label="Email" type="email" {...form.field('email')} />
          <form.Error name="email" />
          <Button type="submit">Join</Button>
          {form.result.value && <p>You're on the list</p>}
        </>
      )}
    </Form>
  )
}
