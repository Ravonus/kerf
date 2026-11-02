/** What to try in each of this chapter's Learn demos, by demo id (the file name in src/demos). */
export const tries: Record<string, string> = {
  'describe-gallery': 'Add a fourth Profile to Gallery. Profile is written once and used as many times as you like.',
  'describe-markup': 'Compare the TSX with the HTML you would write: every tag is closed, and the whole card has one root.',
  'describe-braces': 'Drag the slider. Only the list\'s font-size changes: the style object reads size.value, so it is a live binding.',
  'describe-children': 'Sell bags until fewer than two are left. The Milk panel\'s border and its data-low attribute follow the count.',
  'describe-packing': 'Tick and untick items. The ternary swaps plain text for a struck-through name, and && adds or removes "(packed)".',
  'describe-mounted': 'Type in both fields, turn the switch off, then on again. The removed field comes back empty; the hidden one kept your text.',
  'describe-people': 'Press Chemists, then Everyone. The rows that stay are the same rows: only the ones that left or came back are made.',
  'describe-keys': 'Type something next to each name, then reverse the order. With key={g.id} your words follow the names; with the index they stay put.',
  'describe-runs': 'Click a few times. The line is worked out again on every click, but the counter inside it keeps counting: the body that made it never ran again.',
  'describe-tree': 'Remove the sidebar, then add it back. Its owner cleans up Sidebar and Search together, and adding it makes both again.',
}
