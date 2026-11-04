/** What to try in each Learn demo, by demo id
 * (the file name in src/demos). */
export const tries: Record<string, string> = {
  'start-components':
    'Add a third <OrderButton /> inside the ' +
    'Card. Each use of a component is its ' +
    'own copy on the page.',
  'start-styles':
    "Change the first Button's tone to " +
    '"critical", or borderLeft\'s 4px to ' +
    '12px. style takes an object, and its ' +
    'colour and spacing are warp tokens.',
  'start-data':
    "Change the barista's name or size in " +
    'the object at the top. Every brace ' +
    'that reads it follows.',
  'start-conditional':
    'Press Sign in. The ternary swaps one ' +
    'paragraph for another, and the && line ' +
    'appears only when both sides are true.',
  'start-list':
    'Add a fifth drink to MENU with its own ' +
    'id. The key tells weft which row is ' +
    'which.',
  'start-events':
    'Press Ring the bell. The handler is ' +
    'passed, not called: onClick={ring}, ' +
    'not onClick={ring()}.',
  'start-counter':
    'Pour a few cups with the first ' +
    'barista. The second count stays at ' +
    'zero: each CupCounter has its own ' +
    'state.',
  'start-derived':
    'Press One more a few times. The label ' +
    'and the total follow cups without ' +
    'being set by hand.',
  'start-shared':
    'Press either of the first two buttons: ' +
    'both move, and so does the sentence. ' +
    'Then press the third: it counts on its ' +
    'own until the shared count changes ' +
    'again.',
  'start-tutorial-step-1':
    'Add a product to PRODUCTS. ProductRow ' +
    'is called once per product, with that ' +
    'product as its prop.',
  'start-tutorial-step-2':
    'Press Add on two different rows. Each ' +
    'badge reads its own entry of the cart, ' +
    'so only that badge changes.',
  'start-tutorial-step-3':
    'Press + and − on a row. The − button ' +
    'turns off at zero, because disabled ' +
    'reads qty.',
  'start-tutorial-step-4':
    'Add a grinder. Shipping is $0 from ' +
    '$40, and the total follows without a ' +
    'line of code that sets it.',
  'start-tutorial-step-5':
    'Add a mug, type "be" in Search, then ' +
    'clear it. The mug comes back with its ' +
    'count, because the cart keeps it, not ' +
    'the row.',
  'start-tutorial-step-6':
    'Add something, type an email and place ' +
    'the order. The cart empties and the ' +
    'receipt shows what was paid.',
  'start-thinking-step-1':
    'Nothing here moves yet: this is the ' +
    'static version. Read how the five ' +
    'components nest.',
  'start-thinking-step-2':
    'The out-of-stock rows are hidden ' +
    'because inStockOnly starts as true. ' +
    'Type in Search: the table stays the ' +
    'same, because nothing writes the state ' +
    'yet.',
  'start-thinking-step-3':
    'Type "de" in Search, then untick the ' +
    'box. SearchBar writes its props, and ' +
    'bind: sends those writes to the ' +
    "parent's state.",
}
