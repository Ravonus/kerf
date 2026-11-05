import type { StageState } from './stage-state'

export function observeStage(
  v: StageState,
  box: HTMLElement,
  host: HTMLElement,
  invalidate: () => void,
  stir: () => void,
) {
  const sizes =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          if (!box.clientWidth) v.hidden = true
          invalidate()
        })
  sizes?.observe(box)
  const watch =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => {
          v.stale = true
          stir()
        })
  watch?.observe(host, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: [
      'data-skin',
      'data-ramp',
      'data-look',
      'aria-pressed',
      'aria-checked',
      'aria-selected',
      'aria-expanded',
      'data-highlighted',
      'aria-current',
      'disabled',
      'open',
      'hidden',
      'class',
      'value',
    ],
  })

  return { sizes, watch }
}
