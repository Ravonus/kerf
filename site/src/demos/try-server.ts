/** What to try in each Learn demo, by demo id
 * (the file name in src/demos).
 */
export const tries: Record<string, string> = {
  'server-live-tags':
    'Add a todo as Alice and watch Bob’s list ' +
    'update. Then drop Bob’s connection, add two ' +
    'more as Alice, and reconnect Bob: he catches ' +
    'up in one refetch.',
  'server-fold':
    'Watch the top line jump between symbols ' +
    'while the list below keeps one row per ' +
    'symbol. Pause the stream: both stop, and ' +
    'nothing is lost from the list.',
  'server-upload-check':
    'Pick a large photo, then a PDF, then a small ' +
    'JPEG. Only the last would be sent, and the ' +
    'server would still check it again.',
  'server-paywall':
    'Press Go Pro, then close the page: still ' +
    'Free. Go again and pay: Pro arrives with the ' +
    'event, not the click. Then redeliver it and ' +
    'see that nothing changes.',
  'server-meta-preview':
    'Make the title long until H004 appears, then ' +
    'empty the description and see the site ' +
    'default take its place.',
  'server-replay':
    'Press Load the page again, then click Add to ' +
    'cart three times before the code arrives: ' +
    'the clicks are held and land in order. Turn ' +
    'replay off and try again.',
}
