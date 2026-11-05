import { Popover } from '@weft-js/warp'

export const PopoverTile = () => (
  <div
    style={
      'display:grid;' +
      'justify-items:center;inline-size:100%'
    }
  >
    <Popover
      inline
      label="Details"
      title="Preview deploys"
      description={
        'Every branch gets its own address, so' +
        ' you can try a change before it goes live.'
      }
    />
  </div>
)
