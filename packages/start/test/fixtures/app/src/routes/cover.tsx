import { Form } from '@kerf/start'
import { Media } from '@kerf/core/media'
import { getCover, setCover } from '../server/forms'

export default function Cover() {
  const cover = getCover()
  return (
    <main>
      <h1>Cover</h1>
      {cover.value ? (
        <Media src={cover.value} alt="The cover" width="480px" />
      ) : (
        <p class="empty">No cover</p>
      )}
      <Form of={setCover} enctype="multipart/form-data" class="cover-form">
        {(form) => (
          <>
            <input type="file" name="file" />
            <form.Error name="file" class="file-error" />
            <p class="message">{form.message.value}</p>
            <button>Upload</button>
          </>
        )}
      </Form>
    </main>
  )
}
