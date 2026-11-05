import type { State } from '@weft-js/core'
import { toast } from '../../Toast'
import { afterFlush } from '../atoms'
import type { FieldErrors, SaveBarProps } from '../SaveBar'

const SAVED_MS = 1500
type Data<T> = {
  box: State<T>
  base: State<T>
  phase: State<'idle' | 'pending' | 'saved'>
  fixes: State<number>
  leaving: State<boolean>
  dirty: { readonly value: boolean }
  refs: {
    target: string
    el?: HTMLDivElement | undefined
    timer?: ReturnType<typeof setTimeout> | undefined
  }
}
export function saveActions<T extends Record<string, unknown>>(
  d: Data<T>,
  errors: () => SaveBarProps<T>['errors'],
  validate: (now: T) => FieldErrors | undefined,
  onSave: SaveBarProps<T>['onSave'],
  onDiscard: () => void,
  hasLeave: () => SaveBarProps<T>['onLeave'],
  onLeave: () => void,
) {
  const { box, base, phase, fixes, leaving, dirty, refs } = d
  const fail = (found: FieldErrors) => {
    if (errors()) errors()!.value = found
    fixes.value = Object.keys(found).length
    afterFlush(() =>
      refs.el?.closest('form')?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    )
  }
  const save = async () => {
    if (phase.value === 'pending' || !dirty.value) return
    const now = box.value
    const found = validate(now)
    if (found && Object.keys(found).length) return fail(found)
    phase.value = 'pending'
    try {
      const back = await onSave(now)
      if (back && Object.keys(back).length) {
        phase.value = 'idle'
        return fail(back)
      }
    } catch {
      phase.value = 'idle'
      toast.show({
        title: 'That didn’t save',
        description: 'Your changes are still here.',
        tone: 'critical',
        action: { label: 'Retry', onClick: save },
      })
      return
    }
    if (errors()) errors()!.value = {}
    fixes.value = 0
    base.value = now
    phase.value = 'saved'
    refs.timer = setTimeout(() => (phase.value = 'idle'), SAVED_MS)
  }
  const discard = () => {
    box.value = base.value
    if (errors()) errors()!.value = {}
    fixes.value = 0
    onDiscard()
  }
  const leave = () => {
    leaving.value = false
    discard()
    if (hasLeave()) onLeave()
    else refs.el?.ownerDocument.defaultView?.location.assign(refs.target)
  }
  return { save, discard, leave }
}
