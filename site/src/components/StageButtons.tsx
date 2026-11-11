import { Button } from '@kerf/veneer'

// [dial, icon, what it changes]: each a corner button on a stage, handled by FrameTools' one listener.
const TOOLS = [
  ['expression', 'palette', 'expression'],
  ['theme', 'moon', 'theme'],
  ['palette', 'paint-bucket', 'palette'],
  ['width', 'smartphone', 'width'],
] as const

/** A stage's corner buttons: its expression, light or dark, named palette and width. Same in a frame and a Playground. */
export function StageButtons() {
  return (
    <>
      {TOOLS.map(([act, icon, what]) => (
        <Button
          key={act}
          emphasis="ghost"
          tone="neutral"
          size="sm"
          icon={icon}
          label={`${what[0]!.toUpperCase()}${what.slice(1)} of this stage`}
          title={`Change this stage's ${what}`}
          data-act={`stage-${act}`}
        />
      ))}
    </>
  )
}
