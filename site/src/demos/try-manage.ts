/** What to try in each of this chapter's Learn demos, by demo id (the file name in src/demos). */
export const tries: Record<string, string> = {
  'manage-quiz': 'Submit a wrong answer, then start typing: the error goes. Then answer Lima. Every screen comes from one status box.',
  'manage-states': 'Every visual state of the quiz at once, with no logic. Compare each card with the status it was given.',
  'manage-selected': 'Choose a snack, then rename it. The line at the bottom follows, because only the id was stored.',
  'manage-chain': 'Type T in the code box: discount re-runs, stays 0, and total does not re-run. Finish typing TEA10 and it does.',
  'manage-accordion': 'Open the second panel. The first closes, because the parent holds which one is open.',
  'manage-reset': 'Type a message to Ana, switch to Ben, then back to Ana. Each contact starts with an empty draft.',
  'manage-context': 'Each Title asks how deep it is. No Title is given a level; the Sections around it decide.',
  'manage-theme': 'Turn on the switch. The button two components down follows, and Actions in between passes nothing.',
  'manage-keep': 'Type a note for Ana, then Reverse. The note moves with Ana. Remove her, and her note is gone.',
  'manage-rows': 'Add a teapot. Only the teapot row and the title change; the other rows do not re-run.',
  'manage-interaction': 'Hover the button, press Tab to focus it, then hold it down. Each bit is a box you can read.',
  'manage-undo': 'Pin three cities, remove one, then press Undo twice. Each action is one step.',
}
