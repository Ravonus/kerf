import { Stack, UsageMeter } from '@weft-js/warp'

export const UsageMeterLevels = () => (
  <Stack gap="group">
    <UsageMeter
      label="Build minutes"
      value={1240}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
    />
    <UsageMeter
      label="Build minutes"
      value={2610}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      note="You're close to this month's limit."
    />
    <UsageMeter
      label="Build minutes"
      value={3000}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      note="Builds queue until the 1st."
    />
    <UsageMeter
      label="Build minutes"
      value={3420}
      limit={3000}
      format={(n) => n.toLocaleString('en-US')}
      overage="+ $12.40 overage"
    />
  </Stack>
)
