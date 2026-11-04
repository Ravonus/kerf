/** What to try in each of this chapter's Learn demos, by demo id (the file name in src/demos). */
export const tries: Record<string, string> = {
  'escape-focus':
    'Press Focus, then Select all, then Blur. Each button calls a method on the one input element the ref holds.',
  'escape-scroll':
    'Press Orlando, then Tom. The list scrolls to the element each name was given by its ref function.',
  'escape-measure':
    'Drag the slider, then resize the window. The number comes from a ResizeObserver started in onMount and stopped by onCleanup.',
  'escape-forward':
    'Press Focus the name. The input lives in NameField, which passed it out through its ref prop.',
  'escape-room':
    'Switch rooms a few times, quickly. Each change disconnects the old room before it connects the new one, and a quick switch never says it connected.',
  'escape-browser':
    'Press a few keys, switch to another window and back, or turn your network off. Each line follows the browser with no listener code in the component.',
  'escape-filter':
    'Type "b" in Search, then turn off Show done. The list and the count are derived: nothing copies them into state.',
  'escape-keyed':
    'Star Ana and write a note, then pick Ben. Ben starts clean; pick Ana again and her note is gone too, because her profile was made new.',
  'escape-owner':
    'Turn the ticker off and on. Its interval stops when the branch goes, with no cleanup code for the interval itself.',
  'escape-root':
    'Start the session, then Stop it. The interval lives in a root made by the click, and Stop disposes that root.',
  'escape-debounce': 'Type a word quickly. "Searching for" changes only once you stop for 400 ms.',
  'escape-pointer':
    'Move the pointer over the dashed box. pointer() is an ordinary function that any component can call.',
  'escape-retry':
    'Wait for the error, press Try again, then Ask again. The Boundary shows its pending view only for the first answer; Ask again keeps the answer, dimmed, with a spinner, until the next one lands.',
  'escape-refresh':
    'Pick a city, then another before it answers. The old temperature stays, dimmed, with an "updating" badge, and the first fetch is cancelled.',
  'escape-reserve':
    'Press Load a quote a few times. While the quote is missing the paragraph keeps its height, so the button never moves.',
  'escape-stream':
    'Press Ask and watch the text arrive. The box grows a whole line at a time, and the first paragraph stays still once it is done.',
  'escape-surface':
    'Drag Wave height. The canvas repaints from the live prop, and nothing around it renders again.',
  'escape-shape':
    'Turn on Show the feed. For the first moment you see grey bars shaped like the posts, made by the compiler from Feed itself.',
}
