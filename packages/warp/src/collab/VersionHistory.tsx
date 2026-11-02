import { announce } from '@weft-js/warp-core'
import { derived, state } from '@weft-js/core'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { read, type Live } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/app/tokens.css'
import '@weft-js/warp-core/styles/app/versions.css'

/** One saved version of a document. */
export interface Version { id: string; title: string; /** "Mei · 10:02" */ meta: string; named?: boolean | undefined; current?: boolean | undefined }

/**
 * Version history (07 §6.2): named versions carry the accent dot. A version previews read-only (`preview` draws it,
 * with its diff tint), then Restore asks in a dialog; restoring makes a new version, so `onRestore` loses nothing.
 */
export function VersionHistory({ versions, preview, onPreview, onRestore, label = 'Version history' }: { versions: Live<Version[]>; preview?: (v: Version) => unknown; onPreview?: (v: Version) => void; onRestore: (v: Version) => void; label?: string | undefined }) {
  const list = derived(() => read(versions))
  const shown = state<Version | null>(null)
  const asking = state<Version | null>(null)
  const viewOpen = state(false)
  const askOpen = state(false)
  let root: HTMLElement | undefined
  const look = (v: Version) => { if (v.current) return; shown.value = v; viewOpen.value = true; onPreview?.(v) }
  const ask = (v: Version) => { asking.value = v; viewOpen.value = false; askOpen.value = true }
  const restore = () => {
    const v = asking.value!
    askOpen.value = false
    onRestore(v)
    if (root) announce(root.ownerDocument, `Restored ${v.title} as a new version`)
  }
  return (
    <>
      <ul ref={n => (root = n)} data-scope="versions" aria-label={label}>
        {list.value.map(v => (
          <li key={v.id} aria-current={v.current ? 'true' : undefined} data-named={v.named ? '' : undefined} onClick={() => look(v)}>
            <i></i>
            <span>{v.title}<small>{v.meta}</small></span>
            {!v.current && <span><Button emphasis="ghost" tone="neutral" size="sm" aria-label={`Preview ${v.title}`} onClick={(e: MouseEvent) => { e.stopPropagation(); look(v) }}>Preview</Button><Button emphasis="ghost" tone="neutral" size="sm" aria-label={`Restore ${v.title}`} onClick={(e: MouseEvent) => { e.stopPropagation(); ask(v) }}>Restore</Button></span>}
          </li>
        ))}
      </ul>
      <Modal open={viewOpen} title={`Preview · ${shown.value?.title ?? ''}`} size="lg" footer={<Button onClick={() => ask(shown.value!)}>Restore</Button>}>
        {shown.value && preview ? <div inert>{preview(shown.value)}</div> : <p>{shown.value?.meta}</p>}
      </Modal>
      <Modal open={askOpen} alert title={`Restore “${asking.value?.title ?? ''}”?`} description="Restoring creates a new version. Nothing is lost." footer={<><Button emphasis="outline" tone="neutral" autofocus onClick={() => (askOpen.value = false)}>Cancel</Button><Button onClick={restore}>Restore</Button></>} />
    </>
  )
}
