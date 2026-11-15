// Shared chrome moves as live DOM. Text uses its ink bounds so different line heights do not squash letters.
export interface SharedMark {
  box: DOMRect
  ink: DOMRect
  text: boolean
}
/** Capture a visible opt-in mark without retaining a detached source element. */
export function sharedMarks() {
  const marks = new Map<string, { element: HTMLElement; mark: SharedMark }>()
  const duplicate = new Set<string>()
  for (const element of document.querySelectorAll<HTMLElement>('[data-kerf-shared]')) {
    const name = element.dataset.kerfShared
    const box = element.getBoundingClientRect()
    if (
      !name ||
      !box.width ||
      !box.height ||
      box.bottom <= 0 ||
      box.top >= innerHeight ||
      box.right <= 0 ||
      box.left >= innerWidth
    )
      continue
    const style = getComputedStyle(element)
    if (
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      element.closest('[data-kerf-motion="off"]')
    )
      continue
    if (marks.has(name)) {
      duplicate.add(name)
      continue
    }
    const text = element.dataset.kerfSharedFit === 'text'
    let ink = box
    if (text) {
      const range = document.createRange()
      range.selectNodeContents(element)
      ink = range.getBoundingClientRect()
    }
    if (ink.width && ink.height) marks.set(name, { element, mark: { box, ink, text } })
  }
  for (const name of duplicate) marks.delete(name)
  return marks
}
/** Fit a source to the destination while retaining an authored translate transform. */
export function sharedFrames(source: SharedMark, target: SharedMark, transform: string) {
  const matrix = new DOMMatrix(transform === 'none' ? undefined : transform)
  if (!matrix.is2D || matrix.a !== 1 || matrix.d !== 1 || matrix.b || matrix.c) return
  const sx = source.ink.width / target.ink.width
  const sy = source.text && target.text ? sx : source.ink.height / target.ink.height
  const x =
    source.ink.left -
    target.box.left -
    (target.ink.left - target.box.left) * sx -
    (sx - 1) * matrix.e
  const y =
    source.ink.top - target.box.top - (target.ink.top - target.box.top) * sy - (sy - 1) * matrix.f
  if (Math.abs(x) + Math.abs(y) + Math.abs(sx - 1) + Math.abs(sy - 1) < 0.01) return
  return [
    {
      transform: `translate(${x}px,${y}px) scale(${sx},${sy}) ${transform === 'none' ? '' : transform}`,
      transformOrigin: '0 0',
      opacity: 0.94,
    },
    { transform, transformOrigin: '0 0', opacity: 1 },
  ]
}
