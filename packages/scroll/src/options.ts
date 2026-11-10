// Defaults, and options resolved into the numbers the engine reads every frame.
import { easeOut } from './physics'
import type { BarFrame, BarOptions, ScrollOptions } from './types'

export type Resolved = Required<
  Omit<ScrollOptions, 'renderer' | 'snap' | 'label' | 'onScroll' | 'thumb' | 'bar'>
> & { [K in 'renderer' | 'snap' | 'label' | 'onScroll']: ScrollOptions[K] | undefined } & {
  thumb: NonNullable<ScrollOptions['thumb']>
  bar: BarFrame['bar']
}

/** The look a bar has when no option or CSS says otherwise. Colours follow the text colour, so themes come free. */
export const BAR_DEFAULTS: BarFrame['bar'] = {
  width: 6,
  hoverWidth: 10,
  inset: 2,
  radius: 3,
  color: 'color-mix(in srgb, currentColor 32%, transparent)',
  hoverColor: 'color-mix(in srgb, currentColor 48%, transparent)',
  activeColor: 'color-mix(in srgb, currentColor 60%, transparent)',
  track: 'transparent',
  hoverTrack: 'color-mix(in srgb, currentColor 8%, transparent)',
  layout: 'overlay',
  show: 'scroll',
  hideDelay: 900,
  fade: 200,
  trackClick: 'page',
}

export function resolve(o: ScrollOptions): Resolved {
  const bar = { ...BAR_DEFAULTS, ...defined(o.bar ?? {}) }
  if (o.bar?.radius === undefined) bar.radius = bar.width / 2
  return {
    mode: o.mode ?? 'native',
    axes: o.axes ?? 'both',
    thumb: o.thumb ?? {},
    bar,
    renderer: o.renderer,
    duration: o.duration ?? 220,
    easing: o.easing ?? easeOut,
    friction: o.friction ?? 0.998,
    momentum: o.momentum ?? true,
    wheelSpeed: o.wheelSpeed ?? 1,
    lineHeight: o.lineHeight ?? 40,
    overscroll: o.overscroll ?? 'bounce',
    chain: o.chain ?? 'auto',
    snap: o.snap,
    keyboard: o.keyboard ?? true,
    autoscroll: o.autoscroll ?? true,
    touch: o.touch ?? 'js',
    grab: o.grab ?? false,
    motion: o.motion ?? 'auto',
    label: o.label,
    syncEvents: o.syncEvents ?? true,
    onScroll: o.onScroll,
  }
}

const defined = (o: BarOptions) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as BarOptions

/** The CSS custom properties a bar option sets, so DOM bars and stylesheets read the same values. */
export const BAR_VARS: Partial<Record<keyof BarOptions, string>> = {
  width: '--scroll-width',
  hoverWidth: '--scroll-hover-width',
  inset: '--scroll-inset',
  radius: '--scroll-radius',
  color: '--scroll-color',
  hoverColor: '--scroll-hover-color',
  activeColor: '--scroll-active-color',
  track: '--scroll-track',
  hoverTrack: '--scroll-hover-track',
  fade: '--scroll-fade',
}

/** Write the options the caller gave as custom properties on the root; the rest come from the stylesheet. */
export function writeVars(root: HTMLElement, bar: BarOptions | undefined, reduced: boolean) {
  for (const [key, name] of Object.entries(BAR_VARS)) {
    const v = bar?.[key as keyof BarOptions]
    if (v === undefined) root.style.removeProperty(name)
    else
      root.style.setProperty(
        name,
        typeof v === 'number' ? `${v}${key === 'fade' ? 'ms' : 'px'}` : v,
      )
  }
  if (reduced) root.style.setProperty('--scroll-fade', '0ms')
}
