import { Form, type FormApi } from '@kerf/start'
import { Button, Stack } from '@kerf/veneer'
import { addToCart } from '#/server/cart'

export function AddToCart({ slug, soldOut }: { slug: string; soldOut: boolean }) {
  return (
    <Form of={addToCart} reset={false}>
      {(form: FormApi) => (
        <Stack gap="tight">
          <input type="hidden" name="slug" value={slug} />
          <Button type="submit" size="lg" full disabled={soldOut} loading={form.pending.value}>
            Add to cart
          </Button>
          <form.Error name="slug" class="form-error" />
          <p class="added" role="status">
            {form.result.value ? 'In your cart.' : ''}
          </p>
        </Stack>
      )}
    </Form>
  )
}
