// Keyed body rows and aggregate footer.
import { GridRow, GroupRow, total } from './DataGrid-rows'
import { chevron } from './Table'
import type { GridModel } from './DataGrid-controller'

export function GridBody<T>({ model }: { model: GridModel<T> }) {
  return (
    <tbody>
      {model.lines.value.map((l) =>
        l.kind === 'row' ? (
          <GridRow key={l.id} line={l} ctx={model.ctx} />
        ) : l.kind === 'group' ? (
          <GroupRow key={l.id} line={l} ctx={model.ctx} />
        ) : (
          <tr
            key={l.id}
            role="row"
            data-part="loading"
            aria-level={l.level}
            style={`--_lvl:${l.level}${l.tint ? `;--_bc:var(--veneer-color-data-${l.tint})` : ''}`}
          >
            <td role="gridcell" data-part="tree-cell" colspan={model.ctx.span()}>
              <span data-part="tree-label">
                <span data-part="toggle" data-leaf="" aria-hidden="true">
                  {chevron()}
                </span>
                {`Loading ${l.label}…`}
                <span data-part="skeleton" aria-hidden="true"></span>
              </span>
            </td>
          </tr>
        ),
      )}
    </tbody>
  )
}

export function GridAggregate<T>({ model }: { model: GridModel<T> }) {
  return (
    <tfoot>
      <tr role="row" data-part="aggregate">
        {model.hasDetails && <td role="gridcell"></td>}
        {model.cols.value.map((c, n) => (
          <td
            key={c.id}
            role="gridcell"
            data-numeric={c.numeric ? '' : undefined}
            data-pinned={c.pin ? 'last' : undefined}
          >
            {n === 0 && !c.aggregate
              ? `${model.footed.value.length} ${model.footed.value.length === 1 ? 'row' : 'rows'}`
              : total(c, model.footed.value, model.read)}
          </td>
        ))}
      </tr>
    </tfoot>
  )
}
