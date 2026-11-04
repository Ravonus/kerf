/** What to try in each Learn demo, by demo id
 * (the file name in src/demos). */
export const tries: Record<string, string> = {
  'interact-toolbar':
    'Press both buttons. Toolbar only ' +
    'passes the clicks on; App decides what ' +
    'each one does.',
  'interact-propagation':
    'Press Open, then Star, then Submit. ' +
    'Open reaches the toolbar too, Star ' +
    'stops before it, and Submit keeps the ' +
    'page where it is.',
  'interact-gallery':
    'Press Next a few times, then Show ' +
    'details. Each box changes on its own, ' +
    'and the other keeps its value.',
  'interact-instances':
    'Add to Coffee three times, then to Tea ' +
    'once. Each Counter has its own box.',
  'interact-runs':
    'Add an apple, then a pear. Only the ' +
    'line you changed counts a run. Then ' +
    'press Set apples to 5 twice: the ' +
    'second press writes the same value, so ' +
    'nothing runs.',
  'interact-three':
    'Press +3. Each write reads the one ' +
    'before it, so the score goes up by ' +
    'three, not one.',
  'interact-flush':
    'Press Add one. The box has the new ' +
    'number at once, but the page shows it ' +
    'only after flush(), or after the ' +
    'handler ends.',
  'interact-person':
    'Edit each field. The line below ' +
    'follows, whether the field wrote a new ' +
    'object or used set.',
  'interact-todos-step-1':
    'Type a todo and press Add. The list is ' +
    'a new array with one more item at the ' +
    'end.',
  'interact-todos-step-2':
    'Delete a todo. filter makes a new array without it.',
  'interact-todos-step-3':
    'Tick and untick todos. map makes a new ' +
    'array where only the changed todo is a ' +
    'new object.',
  'interact-nested':
    'Change the city. The piece and the ' +
    'artist are both copied, and the title ' +
    'is untouched.',
  'interact-bind-input':
    'Type in First name, then in Nickname, ' +
    'then press Clear. The bound fields ' +
    'reach the parent; the nickname edit ' +
    'stays in its field until the parent ' +
    'changes.',
  'interact-controls':
    'Change each control and watch the ' +
    'sentence. Every control writes a box, ' +
    'and the sentence reads them all.',
  'interact-submit':
    'Press Join with the field empty, then ' +
    'with an email. The browser checks the ' +
    'field, and the handler stops the page ' +
    'from reloading.',
}
