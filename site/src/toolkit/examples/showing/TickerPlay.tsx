import { Text, Ticker } from '@weft-js/warp'

export const TickerPlay = (p: { value: number; locale: string }) => (
  <Text role="title">
    <Ticker value={p.value} locale={p.locale} />
  </Text>
)
