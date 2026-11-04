/** What to try in each of this chapter's Learn demos, by demo id (the file name in src/demos). */
export const tries: Record<string, string> = {
  'stack-deferred':
    'Watch the name show at once while the reviews wait, then press Load again. The old reviews stay, dimmed, until the new ones land.',
  'stack-tags':
    'Press addTodo, then resetStats. Only the queries that share a tag with the mutation are fetched again; me is never touched.',
  'stack-optimistic':
    'Add "Boil water": it shows at once, marked saving. Then add "fail on purpose" and watch it appear, then go when the server refuses it.',
  'stack-form':
    'Press Sign up with the fields empty, then try taken@example.com. Each error lands next to its field, and focus moves to the first one.',
}
