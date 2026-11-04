import { Form, type FormApi } from '@weft-js/start'
import { Alert, Button, Input, Stack, Text } from '@weft-js/warp'
import { joinWaitlist } from '#/server/waitlist'

export function WaitlistForm() {
  return (
    <Form of={joinWaitlist} class="waitlist">
      {(form: FormApi) => (
        <Stack gap="related">
          {form.message.value && (
            <Alert tone="critical" title="That didn't go through" live>
              Your email wasn't saved. Please try again in a moment.
            </Alert>
          )}
          <div class="waitlist-row">
            <Input
              label="Email"
              type="email"
              autocomplete="email"
              required
              {...form.field('email')}
            />
            <Button type="submit" size="lg" loading={form.pending.value}>
              Join
            </Button>
          </div>
          <form.Error name="email" class="waitlist-error" />
          <Text role="caption" subtle>
            We'll write when your place comes up, and not before.
          </Text>
        </Stack>
      )}
    </Form>
  )
}
