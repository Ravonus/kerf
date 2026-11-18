import { watch, onMount, onCleanup, type State } from '@kerf-js/core'
import { Modal } from './Modal'
import './styles'
import '@kerf-js/veneer-core/styles/components/celebration-overlay.css'

/** A named celebration with optional media and a dismissal deadline. */
export interface CelebrationOverlayProps {
  open: State<boolean>
  title: unknown
  description?: unknown
  /** Decorative media in the panel. Keep essential information in the title or content. */
  media?: unknown
  /** Milliseconds until automatic dismissal. Omit for user dismissal only. */
  duration?: number | undefined
  onDismiss?: (() => void) | undefined
  reducedMotion?: boolean | undefined
  children?: unknown
}

/** A celebration in a native modal, with keyboard dismissal and focus return. */
export function CelebrationOverlay(props: CelebrationOverlayProps) {
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    watch(
      () => (props.open.value ? props.duration : undefined),
      (duration) => {
        clearTimeout(timer)
        if (duration !== undefined && Number.isFinite(duration) && duration > 0)
          timer = setTimeout(() => {
            props.open.value = false
          }, duration)
      },
    )
    watch(
      () => props.open.value,
      (open, previous) => {
        if (!open && previous) props.onDismiss?.()
      },
    )
    onCleanup(() => clearTimeout(timer))
  })
  return (
    <div data-scope="celebration-overlay" data-motion={props.reducedMotion ? 'reduce' : undefined}>
      <Modal open={props.open} title={props.title} description={props.description}>
        {props.media != null && (
          <div data-part="celebration-media" aria-hidden="true" inert="">
            {props.media}
          </div>
        )}
        {props.children}
      </Modal>
    </div>
  )
}
