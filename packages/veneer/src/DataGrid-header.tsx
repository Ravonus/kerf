// The grid's column headings and filter row.
import { CompactSelect } from './Select'
import { sortIcon } from './Table'
import type { GridModel } from './DataGrid-controller'

function GridColumns<T>({ model }: { model: GridModel<T> }) {
  return (
    <tr role="row">
      {model.hasDetails && (
        <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px">
          <span data-part="sr-only">Details</span>
        </th>
      )}
      {model.cols.value.map((c) => (
        <th
          key={c.id}
          role="columnheader"
          scope="col"
          data-col={c.id}
          data-numeric={c.numeric ? '' : undefined}
          data-pinned={c.pin ? 'last' : undefined}
          draggable="true"
          aria-sort={
            model.current.value.sort?.id === c.id ? model.current.value.sort.dir : undefined
          }
        >
          {c.sort ? (
            <button
              type="button"
              data-part="sort"
              aria-describedby={`${model.id}-move`}
              onClick={() => model.askSort(c)}
            >
              {c.header}
              {sortIcon()}
            </button>
          ) : (
            <button type="button" data-part="sort" aria-describedby={`${model.id}-move`}>
              {c.header}
            </button>
          )}
          {c.resize && (
            <span
              data-part="resize"
              role="separator"
              aria-orientation="vertical"
              tabindex="0"
              aria-label={`Resize ${c.header} column`}
              aria-valuenow="80"
              aria-valuemin="80"
              aria-valuemax="480"
            ></span>
          )}
        </th>
      ))}
    </tr>
  )
}

function GridFilterRow<T>({ model }: { model: GridModel<T> }) {
  return (
    <tr role="row" data-part="filters">
      {model.hasDetails && (
        <th role="columnheader">
          <span data-part="sr-only">Details</span>
        </th>
      )}
      {model.cols.value.map((c) => (
        <th key={c.id} role="columnheader">
          {c.filter === 'select' ? (
            <CompactSelect
              label={`Filter ${c.header}`}
              placeholder="Any"
              value={model.current.value.filters[c.id] ?? ''}
              options={(c.options ?? []).map((o) => ({ value: o, label: o }))}
              onValueChange={(v) => model.setFilter(c.id, v)}
            />
          ) : c.filter ? (
            <label>
              <span data-part="sr-only">
                {c.filter === 'min' ? `${c.header} at least` : `Filter ${c.header}`}
              </span>
              <input
                value={model.current.value.filters[c.id] ?? ''}
                inputmode={c.filter === 'min' ? 'numeric' : undefined}
                placeholder={c.filter === 'min' ? '≥' : 'Contains…'}
                onInput={(e: Event) =>
                  model.setFilter(c.id, (e.currentTarget as HTMLInputElement).value)
                }
              />
            </label>
          ) : (
            <span data-part="sr-only">{`No filter for ${c.header}`}</span>
          )}
        </th>
      ))}
    </tr>
  )
}

export function GridHeader<T>({ model }: { model: GridModel<T> }) {
  return (
    <thead>
      <GridColumns model={model} />
      {model.showFilters.value && <GridFilterRow model={model} />}
    </thead>
  )
}
