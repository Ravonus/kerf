import { Link } from '@weft/start'
import { Button, Heading, Skeleton, Stack, Text, toast } from '@weft/warp'
import { derived } from 'weft'
import { ProductArt } from '#/components/ProductArt'
import { money } from '#/lib/catalog'
import { listCart, setQuantity } from '#/server/cart'

const unsaved = () => toast.show({ tone: 'critical', title: "That didn't save", description: 'Your cart is back as it was. Try again in a moment.' })
const change = (slug: string, quantity: number) => setQuantity({ slug, quantity }).catch(unsaved)

export function CartLines() {
  const cart = listCart()
  const lines = derived(() => cart.value ?? [])
  const subtotal = derived(() => lines.value.reduce((sum, line) => sum + line.priceCents * line.quantity, 0))
  return <>{lines.value.length === 0 ? (
    <Stack gap="tight" class="blank">
      <Heading level={2}>Your cart is empty</Heading>
      <Text subtle>Everything you add stays here for sixty days.</Text>
      <Link href="/">Back to the aisles</Link>
    </Stack>
  ) : (
    <Stack gap="group">
      <ul class="lines" aria-label="Cart">
        {lines.value.map(line => (
          <li key={line.slug} class="line">
            <ProductArt name={line.name} />
            <div>
              <Link href={`/p/${line.slug}`}>{line.name}</Link>
              <Text subtle>{money(line.priceCents)} each</Text>
            </div>
            <div class="stepper">
              <Button emphasis="outline" tone="neutral" size="sm" label={`One fewer ${line.name}`} onClick={() => change(line.slug, line.quantity - 1)}>−</Button>
              <span aria-label={`Quantity of ${line.name}`}>{line.quantity}</span>
              <Button emphasis="outline" tone="neutral" size="sm" label={`One more ${line.name}`} disabled={line.quantity >= Math.min(line.stock, 99)} onClick={() => change(line.slug, line.quantity + 1)}>+</Button>
            </div>
            <span class="price">{money(line.priceCents * line.quantity)}</span>
            <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => change(line.slug, 0)} aria-label={`Remove ${line.name}`}>Remove</Button>
          </li>
        ))}
      </ul>
      <div class="total">
        <Text subtle>Subtotal</Text>
        <span class="price">{money(subtotal.value)}</span>
      </div>
      <Text subtle>Checkout opens soon. Your cart keeps until then.</Text>
    </Stack>
  )}</>
}

export const CartLoading = () => <div role="status" aria-label="Loading your cart"><Stack gap="related"><Skeleton lines={4} height="4rem" /></Stack></div>
