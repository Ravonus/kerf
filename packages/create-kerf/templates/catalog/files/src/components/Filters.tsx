import { navigate } from '@kerf/start'
import { Button, Checkbox, NumberField, Stack } from '@kerf/veneer'
import { amount, viewHref, type View } from '#/lib/catalog'

/** A real GET form, so filters work before the page has hydrated. */
export function Filters({ slug, view }: { slug: string; view: View }) {
  const apply = (e: SubmitEvent) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget as HTMLFormElement)
    navigate(
      viewHref(slug, {
        min: amount(data.get('min')),
        max: amount(data.get('max')),
        stock: data.has('stock'),
        page: 1,
      }),
    )
  }
  return (
    <form class="filters" method="get" action={`/c/${slug}`} onSubmit={apply}>
      <Stack gap="related">
        <div class="price-range">
          <NumberField label="Min price" name="min" min={0} prefix="$" defaultValue={view.min} />
          <NumberField label="Max price" name="max" min={0} prefix="$" defaultValue={view.max} />
        </div>
        <Checkbox
          name="stock"
          value="1"
          checked={view.stock}
          onChange={(e: Event) => (e.currentTarget as HTMLInputElement).form!.requestSubmit()}
        >
          In stock only
        </Checkbox>
        <Button type="submit" emphasis="outline" full>
          Apply
        </Button>
      </Stack>
    </form>
  )
}
