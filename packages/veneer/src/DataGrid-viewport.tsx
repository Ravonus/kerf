// The grid's viewport and table.
import { GridHeader } from './DataGrid-header'
import { GridBody, GridAggregate } from './DataGrid-body'
import type { DataGridProps } from './DataGrid'
import type { GridModel } from './DataGrid-controller'

export function GridViewport<T>({
  model,
  props,
}: {
  model: GridModel<T>
  props: DataGridProps<T>
}) {
  return (
    <div
      data-part="viewport"
      tabindex="-1"
      style={props.maxHeight ? `--veneer-table-max-h:${props.maxHeight}` : undefined}
    >
      <table
        role={model.treed.value ? 'treegrid' : 'grid'}
        aria-labelledby={`${model.id}-cap`}
        aria-describedby={`${model.id}-hint`}
        aria-multiselectable="true"
        aria-rowcount={model.visible.value.length + 1}
        aria-colcount={model.ctx.span()}
      >
        <caption id={`${model.id}-cap`} data-part={props.captionHidden ? 'sr-only' : undefined}>
          {props.caption}
        </caption>
        <GridHeader model={model} />
        <GridBody model={model} />
        {model.hasAggregate.value && <GridAggregate model={model} />}
      </table>
    </div>
  )
}
