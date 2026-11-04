import { Form, type FormApi } from '@weft-js/start'
import { Alert, Button, Input } from '@weft-js/warp'
import { state } from '@weft-js/core'
import { addTodo } from '#/server/todos'

export function NewTodo() {
  const id = state(crypto.randomUUID())
  return (
    <Form of={addTodo} class="new-todo" onSuccess={() => (id.value = crypto.randomUUID())}>
      {(form: FormApi) => (
        <>
          <input type="hidden" name="id" value={id.value} />
          <div class="new-todo-row">
            <Input label="New todo" autocomplete="off" required {...form.field('title')} />
            <Button type="submit">Add</Button>
          </div>
          <form.Error name="title" class="form-error" />
          {form.message.value && (
            <Alert tone="critical" title="That wasn't saved" live>
              Your todo is still in the box. Try adding it again in a moment.
            </Alert>
          )}
        </>
      )}
    </Form>
  )
}
