import { DitherStage, Stack, Row } from '@kerf-js/veneer'

// A modal is a native <dialog> with a stage of its own:
// the veil dithers over the page and the panel dissolves
// in.
export const StageModal = () => {
  let dialog: HTMLDialogElement | undefined
  return (
    <DitherStage
      ground={0.3}
      style="padding:28px"
    >
      <button
        data-skin="button"
        onClick={() => dialog?.showModal()}
      >
        Rename project
      </button>
      <dialog
        ref={(n) => (dialog = n)}
        aria-label="Rename project"
      >
        <DitherStage
          layout="page"
          veil={0.5}
          ground={0}
          onClick={(e: MouseEvent) =>
            e.target === e.currentTarget &&
            dialog?.close()
          }
        >
          <form
            method="dialog"
            data-skin="panel"
          >
            <div data-skin="bar">
              <span>Rename project</span>
            </div>
            <Stack gap="related">
              <label data-part="label">
                Name
                <input
                  data-skin="field"
                  value="storefront"
                  autofocus
                />
              </label>
              <Row
                gap="related"
                justify="end"
              >
                <button
                  data-skin="button"
                  data-look="outline"
                  value="cancel"
                >
                  Cancel
                </button>
                <button
                  data-skin="button"
                  value="save"
                >
                  Save
                </button>
              </Row>
            </Stack>
          </form>
        </DitherStage>
      </dialog>
    </DitherStage>
  )
}
