import { LoadMore } from '@kerf/veneer'

export const LoadMoreDone = () => (
  <LoadMore
    auto={false}
    done
    message="That is every deploy from October."
    onLoad={() => {}}
  />
)
