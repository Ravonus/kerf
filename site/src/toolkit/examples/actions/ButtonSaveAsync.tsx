import { state } from '@weft-js/core'
import { Button, Toaster, toast } from '@weft-js/warp'

export function ButtonSaveAsync() {
  const saving = state(false)
  const save = async () => {
    saving.value = true
    await new Promise((done) => {
      setTimeout(done, 1500)
    })
    saving.value = false
    toast.show({ title: 'Saved', description: 'Your changes are live.' })
  }
  return (
    <>
      <Button loading={saving.value} onClick={save}>
        {saving.value ? 'Saving' : 'Save changes'}
      </Button>
      <Toaster />
    </>
  )
}
