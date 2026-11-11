import { navigate } from '@kerf/start'
import { Input, Select } from '@kerf/veneer'
import { defaultView, statuses, viewHref, type OrderView } from '#/lib/orders'

const options = [
  { value: '', label: 'all' },
  ...statuses.map((status) => ({ value: status, label: status })),
]

/** A real GET form, so filters work before the page has hydrated. */
export function OrdersFilters({ view }: { view: OrderView }) {
  const show = (change: Partial<OrderView>) => navigate(viewHref({ ...view, page: 1, ...change }))
  const search = (e: SubmitEvent) => {
    e.preventDefault()
    const q = new FormData(e.currentTarget as HTMLFormElement).get('q')
    show({ q: typeof q === 'string' ? q.trim() : '' })
  }
  return (
    <form class="filters" method="get" action="/admin/orders" onSubmit={search}>
      {view.sort !== defaultView.sort || view.dir !== defaultView.dir ? (
        <>
          <input type="hidden" name="sort" value={view.sort} />
          <input type="hidden" name="dir" value={view.dir} />
        </>
      ) : null}
      <Input
        label="Search"
        name="q"
        placeholder="Customer name"
        autocomplete="off"
        value={view.q}
      />
      <Select
        label="Status"
        name="status"
        options={options}
        value={view.status}
        onChange={(e) =>
          show({ status: (e.currentTarget as HTMLSelectElement).value as OrderView['status'] })
        }
      />
    </form>
  )
}
