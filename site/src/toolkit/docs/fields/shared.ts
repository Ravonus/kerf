export const shell = {
  label: 'The visible name, and what screen readers announce.',
  hint: 'A short line of help under the field.',
  error: 'Replaces the hint and marks the field invalid.',
  name: 'Posts the value with a form.',
  disabled: "Can't be focused or changed.",
}

export const picker = {
  ...shell,
  value: 'The code, or a `State` to bind.',
  defaultValue: "The first value, when you don't hold it yourself.",
  onValueChange: 'Hears the new value and why it changed.',
  preferred: 'Codes pinned to the top of the list.',
  options: 'Limits the list to these codes.',
  locale: 'The language names are shown in. Follows the page otherwise.',
}

export const listKeys: [string, string][] = [
  ['Enter Space', 'Opens the list'],
  ['↑ ↓', 'Moves through the results'],
  ['Enter', 'Picks the highlighted row'],
  ['Esc', 'Closes and returns focus'],
]
