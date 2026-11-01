// An icon with a part that moves. CSS does the moving, so there is no script and nothing runs until the trigger.
import { Svg, type IconProps } from './svg'

/** What starts it. `on` runs now, and an icon that loops keeps going. Without one: hover, focus and press. */
export type IconTrigger = 'hover' | 'focus' | 'press' | 'on'
export type ActionIconProps = IconProps & { action?: IconTrigger | boolean }

/*#__NO_SIDE_EFFECTS__*/
export function acting(line: string, pixels: string) {
  return ({ action, ...rest }: ActionIconProps) => <Svg {...rest} data-act={typeof action === 'string' ? action : 'hover focus press'} html={line + pixels} />
}
