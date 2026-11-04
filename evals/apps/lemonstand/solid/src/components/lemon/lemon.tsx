import { mergeProps } from 'solid-js'

import { EXPRESSIONS, type LemonExpression } from './face'
import { AVATAR_VIEWBOX, lemonFigure, lemonHead, POSES, VIEWBOX, type LemonPose } from './rig'

export { EXPRESSIONS, POSES, type LemonExpression, type LemonPose }

const POSE_WORDS: Record<LemonPose, string> = {
  idle: 'standing',
  wave: 'waving',
  point: 'pointing',
  present: 'presenting with an open hand',
  think: 'thinking with a hand on its chin',
  celebrate: 'jumping with both arms up',
  thumbsUp: 'giving a thumbs-up',
  clipboard: 'holding a clipboard',
}

/** Default accessible name, e.g. "Lemon, the Lemonstand coach, looking happy and waving". */
export function describeLemon(expression: LemonExpression, pose: LemonPose) {
  return `Lemon, the Lemonstand coach, looking ${expression} and ${POSE_WORDS[pose]}`
}

/** Cheap deterministic hash so each instance blinks on its own beat (SSR-stable). */
function beat(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** The per-instance blink timing, as CSS custom properties. */
function blink(seed: string) {
  const b = beat(seed)
  return `--lemon-blink-delay:${-(b % 4200)}ms;--lemon-blink-dur:${4800 + (b % 1600)}ms`
}

export type LemonProps = {
  /** Unique on the page: prefixes the rig's clip-path ids. */
  uid: string
  expression?: LemonExpression
  pose?: LemonPose
  /** Rendered height in px. Width follows the 216:272 aspect. Omit to size with CSS. */
  size?: number
  /** Mirror the whole figure (e.g. to point left). */
  flip?: boolean
  /** Idle breathing, blink, wave and hop. Always off under prefers-reduced-motion. */
  animated?: boolean
  /** Ground shadow under the sneakers. */
  shadow?: boolean
  /** Accessible name. Defaults to a description of expression + pose. */
  label?: string
  /** Hide from assistive tech when the surrounding text already says it. */
  decorative?: boolean
  class?: string
}

/**
 * Lemon, the Lemonstand coach. A hand-built SVG rig: SSR-safe, no canvas, no JS
 * animation. `<Lemon uid="hero" expression="happy" pose="wave" size={240} />`
 */
export function Lemon(raw: LemonProps) {
  const props = mergeProps(
    {
      expression: 'happy',
      pose: 'idle',
      flip: false,
      animated: true,
      shadow: true,
      decorative: false,
    } as const,
    raw,
  )
  const name = () => props.label ?? describeLemon(props.expression, props.pose)
  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`}
      width={props.size ? Math.round((props.size * VIEWBOX.w) / VIEWBOX.h) : undefined}
      height={props.size}
      class={['lemon', props.class].filter(Boolean).join(' ')}
      data-animated={props.animated ? 'true' : 'false'}
      data-pose={props.pose}
      data-expression={props.expression}
      style={blink(`${props.expression}${props.pose}${props.size ?? 0}${props.uid}`)}
      aria-hidden={props.decorative ? 'true' : undefined}
      role={props.decorative ? undefined : 'img'}
      aria-label={props.decorative ? undefined : name()}
    >
      {!props.decorative && <title>{name()}</title>}
      <g
        transform={props.flip ? `translate(${VIEWBOX.w + 2 * VIEWBOX.x} 0) scale(-1 1)` : undefined}
      >
        {lemonFigure({
          expression: props.expression,
          pose: props.pose,
          uid: props.uid,
          shadow: props.shadow,
        })}
      </g>
    </svg>
  )
}

export type LemonAvatarProps = {
  /** Unique on the page, as for `Lemon`. */
  uid: string
  expression?: LemonExpression
  /** Diameter in px. */
  size?: number
  /** "lemon" = warm cream disc (light surfaces); "navy" = for dark headers. */
  tone?: 'lemon' | 'navy'
  animated?: boolean
  label?: string
  decorative?: boolean
  class?: string
}

/** Head-only circular badge for coach bubbles, chat headers and lists. */
export function LemonAvatar(raw: LemonAvatarProps) {
  const props = mergeProps(
    {
      expression: 'happy',
      size: 44,
      tone: 'lemon',
      animated: true,
      label: 'Lemon, the Lemonstand coach',
      decorative: false,
    } as const,
    raw,
  )
  return (
    <span
      class={[
        'lemon-avatar inline-grid shrink-0 place-items-center overflow-hidden rounded-full',
        props.tone === 'navy'
          ? 'bg-navy-hover ring-2 ring-white/15'
          : 'bg-lemon-soft ring-2 ring-navy',
        props.class,
      ]
        .filter(Boolean)
        .join(' ')}
      style={`width:${props.size}px;height:${props.size}px`}
    >
      <svg
        viewBox={AVATAR_VIEWBOX}
        width={props.size}
        height={props.size}
        class="lemon"
        data-animated={props.animated ? 'true' : 'false'}
        aria-hidden={props.decorative ? 'true' : undefined}
        role={props.decorative ? undefined : 'img'}
        aria-label={props.decorative ? undefined : props.label}
      >
        {!props.decorative && <title>{props.label}</title>}
        {lemonHead({ expression: () => props.expression, uid: props.uid })}
      </svg>
    </span>
  )
}
