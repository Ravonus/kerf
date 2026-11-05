import { Inset, Row, Stack, Text } from '@weft-js/warp'

export const InsetInvoiceTotal = () => (
  <Stack gap="related">
    <Text role="heading">Next invoice</Text>
    <Text subtle>Billed on 1 November to the card ending 4242.</Text>
    <Inset>
      <Stack gap="tight">
        <Row justify="between">
          <Text subtle>Compute</Text>
          <Text>$7,410</Text>
        </Row>
        <Row justify="between">
          <Text subtle>Bandwidth</Text>
          <Text>$1,120</Text>
        </Row>
        <Row justify="between">
          <Text subtle>Seats</Text>
          <Text>$400</Text>
        </Row>
        <Row justify="between">
          <Text role="label">Total</Text>
          <Text role="label">$8,930</Text>
        </Row>
      </Stack>
    </Inset>
  </Stack>
)
