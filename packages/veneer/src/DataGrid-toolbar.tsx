// The grid's toolbar and its controls.
import { XIcon } from '@kerf/veneer-icons'
import { Button } from './Button'
import { Search } from './Field'
import { Select } from './Select'
import { ColumnsPanel, columnsIcon } from './Table'
import type { DataGridProps } from './DataGrid'
import type { GridModel } from './DataGrid-controller'

function GridAppliedFilters<T>({ model }: { model: GridModel<T> }) {
  return (
    <div data-scope="chips" role="group" aria-label="Applied filters">
      {model.applied.value.map((f) => (
        <span key={f.k} data-scope="chip">
          {f.c?.header} {model.opOf(f.c)} <b>{f.v}</b>
          <button
            type="button"
            aria-label={`Remove filter ${f.c?.header}`}
            onClick={() => model.setFilter(f.k, '')}
          >
            <XIcon />
          </button>
        </span>
      ))}
      <button type="button" data-part="clear" onClick={() => model.change({ filters: {} })}>
        Clear all
      </button>
    </div>
  )
}

function GridColumnPicker<T>({ model }: { model: GridModel<T> }) {
  return (
    <div>
      <Button
        emphasis="outline"
        tone="neutral"
        ref={(n) => (model.refs.columnsButton = n)}
        aria-expanded={model.picking.value ? 'true' : 'false'}
        aria-controls={model.pickerBuilt.value ? `${model.id}-cols` : undefined}
        onClick={() => {
          model.pickerBuilt.value = true
          model.picking.value = !model.picking.value
        }}
      >
        {columnsIcon()}Columns
      </Button>
      {model.pickerBuilt.value && (
        <ColumnsPanel
          id={`${model.id}-cols`}
          open={model.picking}
          trigger={() => model.refs.columnsButton!}
          items={model.all.value.filter((c) => !c.pin)}
          shown={(c) => !model.current.value.hidden.includes(c.id)}
          flip={model.toggleHidden}
        />
      )}
    </div>
  )
}

export function GridToolbar<T>({ model, props }: { model: GridModel<T>; props: DataGridProps<T> }) {
  return (
    <div data-part="toolbar">
      {props.filter !== undefined && (
        <Search
          label={props.filter}
          value={model.query.value}
          onInput={(e: Event) => (model.query.value = (e.currentTarget as HTMLInputElement).value)}
        />
      )}
      {props.views && (
        <Select
          label="View"
          size="sm"
          value={model.named.value}
          options={Object.keys(model.saved.value).map((v) => ({ value: v, label: v }))}
          onChange={(e: Event) => model.useView((e.currentTarget as HTMLInputElement).value)}
        />
      )}
      {props.views && (
        <Button emphasis="ghost" tone="neutral" onClick={model.save}>
          Save view
        </Button>
      )}
      {model.applied.value.length > 0 && <GridAppliedFilters model={model} />}
      <span data-part="spacer"></span>
      {props.actions}
      {props.tree && (
        <Button emphasis="outline" tone="neutral" onClick={() => model.expandAll(true)}>
          Expand all
        </Button>
      )}
      {props.tree && (
        <Button emphasis="outline" tone="neutral" onClick={() => model.expandAll(false)}>
          Collapse all
        </Button>
      )}
      {model.canFilter.value && (
        <Button
          emphasis="outline"
          tone="neutral"
          aria-pressed={model.showFilters.value ? 'true' : 'false'}
          onClick={() => (model.showFilters.value = !model.showFilters.value)}
        >
          Filters
        </Button>
      )}
      {model.canGroup && (
        <Button
          emphasis="outline"
          tone="neutral"
          aria-pressed={model.current.value.group ? 'true' : 'false'}
          onClick={() => model.change({ group: !model.current.value.group })}
        >
          Group
        </Button>
      )}
      <GridColumnPicker model={model} />
      {props.exportName !== false && (
        <Button emphasis="outline" tone="neutral" onClick={model.download}>
          Export CSV
        </Button>
      )}
    </div>
  )
}
