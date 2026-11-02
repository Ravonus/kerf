import { Button } from '@weft-js/warp'
import { Preview } from './Preview'
import type { ExampleRef } from '../toolkit/types'

export type ShownExample = ExampleRef & { code: string; lines: number }

/** Lines that show before the code folds. */
const FOLD = 3

/**
 * The page's one object: stage, then code docked under it. The stage's own controls and the fold are plain attributes,
 * handled by StageBar's one listener, so a page of twenty frames runs no code per frame.
 */
export function ExampleFrame(props: { file: string; example: ShownExample; hero?: boolean }) {
  const ex = props.example
  return (
    <div data-site="frame" data-flow="card" data-hero={props.hero ? '' : undefined}>
      <div data-part="tools">
        <span data-part="views" role="group" aria-label="View">
          <Button emphasis="ghost" tone="neutral" size="sm" data-act="stage-view" data-view="preview" aria-pressed="true">Preview</Button>
          <Button emphasis="ghost" tone="neutral" size="sm" data-act="stage-view" data-view="code" aria-pressed="false">Code</Button>
        </span>
        <span data-part="spacer"></span>
        <span data-part="stage-tools">
          {ex.replay && <Button emphasis="ghost" tone="neutral" size="sm" icon="rotate-ccw" data-act="stage-replay">Replay</Button>}
          <Button emphasis="ghost" tone="neutral" size="sm" icon="palette" label="Expression of this stage" title="Change this stage's expression" data-act="stage-expression" />
          <Button emphasis="ghost" tone="neutral" size="sm" icon="moon" label="Theme of this stage" title="Change this stage's theme" data-act="stage-theme" />
          <Button emphasis="ghost" tone="neutral" size="sm" icon="smartphone" label="Width of this stage" title="Change this stage's width" data-act="stage-width" />
        </span>
      </div>
      <div data-part="stage" data-expression={ex.scope?.expression} data-theme={ex.scope?.theme} data-form={ex.scope?.form} data-pinned={ex.scope ? '' : undefined} style={ex.height ? `--stage-h:${ex.height}px` : undefined}>
        <Preview file={props.file} id={ex.id} stage={ex.stage} />
      </div>
      <div data-part="code" data-fold={ex.lines > FOLD && !ex.codeOpen ? '' : undefined}>
        <div
          // oxlint-disable-next-line weft/no-html-sink -- highlighted at build time from this repo's examples
          innerHTML={ex.code}></div>
        {ex.lines > FOLD && !ex.codeOpen && <Button emphasis="outline" tone="neutral" size="sm" data-act="stage-code">View code</Button>}
      </div>
    </div>
  )
}
