import { bump, counter, noteFeed, postNote } from '../server/feed'

export default function Live() {
  const count = counter.live()
  const feed = noteFeed(undefined, {
    fold: (acc: string[], m: { text: string }) => [...acc, m.text],
    initial: [] as string[],
  })
  return (
    <main>
      <p aria-label="status">{count.live.value}</p>
      <p aria-label="hits">{count.value?.hits}</p>
      <p aria-label="notes">{feed.value.join(',')}</p>
      <button onClick={() => bump()}>bump</button>
      <button onClick={() => postNote({ text: 'hi' })}>post</button>
    </main>
  )
}
