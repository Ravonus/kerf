import { Boundary, state } from '@kerf-js/core'
import { Feed } from './index'

/** The baseline: the same feed under five fixed bars. */
export default function Naive() {
  const on = state(false)
  return (
    <main>
      <button id="one" onClick={() => (on.value = true)}>
        One
      </button>
      {on.value ? (
        <div>
          <Boundary
            pending={
              <div class="bars">
                {[1, 2, 3, 4, 5].map((i) => (
                  <p key={i} style="height:72px;margin:0">
                    …
                  </p>
                ))}
              </div>
            }
          >
            <Feed limit={20} seed={3} v={1} />
          </Boundary>
        </div>
      ) : null}
      <footer id="after">After the feed</footer>
    </main>
  )
}
