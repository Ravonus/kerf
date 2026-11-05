import type { Piece, Scene, StageOptions, Word } from './stage'

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function stageWords(el: HTMLElement, box: HTMLElement, unit: number): Word[] {
  const origin = box.getBoundingClientRect(),
    range = document.createRange(),
    walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
    out: Word[] = []
  const measure = document.createElement('canvas').getContext('2d')
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    const st = getComputedStyle(n.parentElement!),
      upper = st.textTransform === 'uppercase',
      size = parseFloat(st.fontSize) / unit
    const font = `${st.fontStyle} ${st.fontWeight} ${size}px ${st.fontFamily}`,
      spacing = (parseFloat(st.letterSpacing) || 0) / unit
    if (measure) measure.font = font
    const m = measure?.measureText('Hg'),
      asc = m?.fontBoundingBoxAscent ?? size * 0.8,
      desc = m?.fontBoundingBoxDescent ?? size * 0.2
    for (const word of n.data.matchAll(/\S+/g)) {
      range.setStart(n, word.index)
      range.setEnd(n, word.index + word[0].length)
      const at = range.getClientRects()[0]
      if (!at) continue
      const top = (at.top - origin.top) / unit,
        h = at.height / unit
      out.push({
        text: upper ? word[0].toUpperCase() : word[0],
        x: (at.left - origin.left) / unit,
        y: top + (h - asc - desc) / 2 + asc,
        w: at.width / unit,
        font,
        spacing,
      })
    }
  }
  return out
}

// States come from the DOM itself (:hover, :focus-visible, checked, aria-pressed), so a look can't disagree with it.
export function readPiece(
  el: HTMLElement,
  base: DOMRect,
  ease: number,
  snap: boolean,
  states: WeakMap<HTMLElement, Piece>,
  host: HTMLElement,
  unit: number,
  pointer: { x: number; y: number },
  lively: () => boolean,
): Piece {
  const b = el.getBoundingClientRect(),
    cut = (v: number) => (snap ? Math.round(v) : v)
  let p = states.get(el)
  if (!p)
    states.set(
      el,
      (p = {
        el,
        skin: '',
        x: 0,
        y: 0,
        w: -1,
        h: -1,
        r: 0,
        hover: 0,
        press: 0,
        focus: 0,
        on: 0,
        value: 0,
        seen: lively() && !host.matches('[data-veil], [popover]') ? 0 : 1,
        disabled: false,
        invalid: false,
        px: 0,
        py: 0,
      }),
    )
  const w = cut(b.width / unit),
    h = cut(b.height / unit)
  if (w !== p.w || h !== p.h)
    p.r = Math.min(cut(parseFloat(getComputedStyle(el).borderTopLeftRadius) / unit) || 0, h / 2)
  p.skin = el.dataset.skin ?? ''
  p.x = cut((b.left - base.left) / unit)
  p.y = cut((b.top - base.top) / unit)
  p.w = w
  p.h = h
  p.px = (pointer.x - b.left) / unit
  p.py = (pointer.y - b.top) / unit
  p.disabled = el.matches(':disabled, [aria-disabled="true"]')
  let invalid = false
  try {
    invalid = el.matches(':user-invalid')
  } catch {
    /* an older engine: no invalid state */
  }
  p.invalid = invalid
  readStates(el, p, ease)
  return p
}

function readStates(el: HTMLElement, p: Piece, ease: number) {
  const input = el as HTMLInputElement,
    aria = (name: string) => el.getAttribute(name) === 'true'
  const on =
    input.checked ||
    aria('aria-pressed') ||
    aria('aria-selected') ||
    aria('aria-checked') ||
    aria('aria-expanded') ||
    el.hasAttribute('open') ||
    (el.hasAttribute('aria-current') && el.getAttribute('aria-current') !== 'false')
  const value =
    input.type === 'range'
      ? (+input.value - +(input.min || 0)) / (+(input.max || 100) - +(input.min || 0) || 1)
      : el instanceof HTMLProgressElement || el instanceof HTMLMeterElement
        ? el.value / (el.max || 1)
        : 0
  const toward = (now: number, goal: number) =>
    Math.abs(goal - now) < 0.01 ? goal : now + (goal - now) * ease
  p.hover = toward(p.hover, !p.disabled && el.matches(':hover, [data-highlighted]') ? 1 : 0)
  p.press = toward(p.press, !p.disabled && el.matches(':active') ? 1 : 0)
  p.focus = toward(
    p.focus,
    el.matches(':focus-visible') || (el.matches('input, select, textarea') && el.matches(':focus'))
      ? 1
      : 0,
  )
  p.on = toward(p.on, on ? 1 : 0)
  p.value = toward(p.value, clamp(value))
}

export function paintStage(scene: Scene, options: StageOptions, moving: boolean) {
  const { ctx } = scene
  if (options.paint) moving = options.paint(scene) === true || moving
  else {
    ctx.clearRect(0, 0, scene.width, scene.height)
    options.background?.(scene)
    for (const p of scene.pieces) {
      const fn = options.painters?.[p.skin]
      if (!fn) continue
      ctx.save()
      fn(p, scene)
      ctx.restore()
    }
    options.overlay?.(scene)
  }
  return moving
}
