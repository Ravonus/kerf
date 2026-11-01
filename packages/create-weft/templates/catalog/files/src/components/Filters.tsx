import { navigate } from '@weft/start'
import { Button, Checkbox, Input, Stack } from '@weft/warp'
import { amount, viewHref, type View } from '#/lib/catalog'

/** A real GET form, so filters work before the page has hydrated. */
export function Filters({ slug, view }: { slug: string; view: View }) {
  const apply = (e: SubmitEvent) => {
    e.preventDefault()
    const data = new FormData(e.currentTarget as HTMLFormElement)
    navigate(viewHref(slug, { min: amount(data.get('min')), max: amount(data.get('max')), stock: data.has('stock'), page: 1 }))
  }
  return (
    <form class="filters" method="get" action={`/c/${slug}`} onSubmit={apply}>
      <Stack gap="related">
        <div class="price-range">
          <Input label="Min price" name="min" type="number" min="0" inputmode="numeric" placeholder="$0" value={view.min?.toString() ?? ''} />
          <Input label="Max price" name="max" type="number" min="0" inputmode="numeric" placeholder="Any" value={view.max?.toString() ?? ''} />
        </div>
        <Checkbox name="stock" value="1" checked={view.stock} onChange={(e: Event) => (e.currentTarget as HTMLInputElement).form!.requestSubmit()}>In stock only</Checkbox>
        <Button type="submit" emphasis="outline" full>Apply</Button>
      </Stack>
    </form>
  )
}
