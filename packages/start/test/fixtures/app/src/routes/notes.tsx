import { Form } from '@weft-js/start'
import { addNote, listNotes } from '../server/forms'

export default function Notes() {
  const notes = listNotes()
  return (
    <main>
      <h1>Notes</h1>
      <ul class="notes">{(notes.value ?? []).map(n => <li key={n.title}>{n.title} × {n.qty}{n.urgent ? ' !' : ''}</li>)}</ul>
      <Form of={addNote} class="note-form" data-kind="note">
        {form => (
          <>
            <label>Title <input {...form.field('title')} /></label>
            <form.Error name="title" class="title-error" />
            <label>Quantity <input {...form.field('qty')} /></label>
            <form.Error name="qty" class="qty-error" />
            <label><input type="checkbox" name="urgent" /> Urgent</label>
            <label>Password <input type="password" {...form.field('password')} /></label>
            <p class="message">{form.message.value}</p>
            <button disabled={form.pending.value}>{form.pending.value ? 'Saving' : 'Add'}</button>
            <output>{form.result.value?.count}</output>
          </>
        )}
      </Form>
    </main>
  )
}
