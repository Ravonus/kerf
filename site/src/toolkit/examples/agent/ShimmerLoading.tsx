import { Shimmer, Stack } from '@kerf/veneer'

export const ShimmerLoading = () => (
  <Stack gap="related">
    <Shimmer>Reading 214 log lines…</Shimmer>
    <Shimmer>Comparing d-4801 with d-4819…</Shimmer>
  </Stack>
)
