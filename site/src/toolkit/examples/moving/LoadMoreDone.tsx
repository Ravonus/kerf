import { LoadMore } from '@kerf-js/veneer'

export const LoadMoreDone = () => (
  <LoadMore
    auto={false}
    done
    message="That is every deploy from October."
    onLoad={() => {}}
  />
)
