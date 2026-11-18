# Field and Accordion

Bind a field to other help text and extend a disclosure header.

```tsx
import { Accordion, Badge, Input } from '@kerf-js/veneer'

<>
  <p id="units">Use whole centimeters.</p>
  <Input
    label="Width"
    appearance="line"
    name="width"
    type="number"
    min={0}
    hint="Measure the inside edge."
    aria-describedby="units"
    attrs={{ class: 'measurement' }}
  />
  <Accordion
    defaultOpen={['detail']}
    multiple
    items={[{
      value: 'detail',
      title: 'Dimensions',
      subtitle: 'Measurements for the frame',
      trailing: <Badge>Updated</Badge>,
      content: <p>120 × 90 cm</p>,
    }]}
  />
</>
```

`Field`, `Input`, `Search` and `Textarea` accept `attrs` for wrapper attributes and take native input attributes on the control. `aria-describedby` adds the supplied IDs to the field's own hint or error. `labelContent` can provide declarative decorative markup for the visible label, and the plain string `label` still names the control. Keep controls out of label content. Use the existing `appearance="line"` for the floating line appearance and `variant="classic"` for an above-field label.

Pass `multiple` for independent accordion panels and initialize their keys with `defaultOpen`. To control the keys pass `open` and assign the array reported by `onChange`. Each item accepts `subtitle` and a non-interactive `trailing` slot in the button. Enter and Space toggle a panel. Up, Down, Home and End move across enabled headers. Collapsed panel content is inert.
