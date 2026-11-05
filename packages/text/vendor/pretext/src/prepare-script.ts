import { findGraphemeEnds, type GraphemeTable } from './graphemes.js'
import { scriptClassFacts } from './generated/engine-break-data.js'
import { DEFAULT_IGNORABLE, getClass, hasProperty, unpackClasses, type ClassTable } from './line-breaks.js'

// Blink splits a text into script runs and shapes each apart (ScriptRunIterator,
// script_run_iterator.cc; HarfBuzzShaper::Shape, harfbuzz_shaper.cc:1063-1104). Two rules of
// the Chromium profile turn on the run a character is in: a word kerns with a space only
// where the two share a run (spaceSharesScriptRun), and the letters of a run in a script
// whose letters join take no letter spacing (getUnspacedGraphemes). Both read the runs
// through readScriptRuns, with a character's scripts as bits: Cyrillic, Greek, Latin, one bit
// for the seven scripts whose letters join, and one for every other script, so two scripts
// that share a bit read as one; a character of any script has all five. Cyrillic, Greek and
// Latin are in Blink's order for a Common character's extensions, by ICU script code with
// Latin last (GetScripts, :191-198), so a run's lowest bit is the script it resolves to. A
// character's scripts, and a few facts more in the bits above them, come from ICU's Script,
// Script_Extensions and bracket pairs as Chrome's build holds them, and Firefox's: a class
// for every code point ('chromium/script') and each class's bits (scriptClassFacts).
// scripts/generate-engine-break-data.ts has which scripts a character is given there, and
// what that leaves out.
export const OTHER_SCRIPT = 1
export const CYRILLIC_SCRIPT = 2
export const GREEK_SCRIPT = 4
export const LATIN_SCRIPT = 8
export const CURSIVE_SCRIPT = 16
export const ANY_SCRIPT = 31
// A mark that scripts list, as they do the Arabic vowel signs, is of any script itself and has
// those scripts in the next five bits. A Common character that no script lists takes them
// from such a mark right after it (FetchNextCharacter, :624-635), so a digit or a dotted circle
// that carries a fatha starts an Arabic run.
export const MARK_SCRIPTS_SHIFT = 5
export const TAKES_MARK_SCRIPTS = 1 << 10
// A character whose own script, whatever else lists it, is one whose letters join.
export const CURSIVE_LETTER = 1 << 11
// A paired bracket, and from this bit up a closing bracket's code less its opening bracket's.
export const OPENING_BRACKET = 1 << 12
export const CLOSING_BRACKET = 1 << 13
export const OPENING_BRACKET_SHIFT = 14

// Every code point's class, unpacked when a text first asks for a script.
let scriptClasses: ClassTable | null = null
function getScriptFacts(c: number): number {
  return scriptClassFacts[getClass(scriptClasses ??= unpackClasses('chromium/script'), c)]!
}

// The facts of the character at text[i], with the scripts it has there, as Blink reads them
// (GetScripts, script_run_iterator.cc:118-215).
function getScriptFactsAt(text: string, i: number): number {
  const c = text.codePointAt(i)!
  const facts = getScriptFacts(c)
  const next = i + (c > 0xFFFF ? 2 : 1)
  if ((facts & TAKES_MARK_SCRIPTS) !== 0 && next < text.length) {
    const markScripts = getScriptFacts(text.codePointAt(next)!) >> MARK_SCRIPTS_SHIFT & ANY_SCRIPT
    if (markScripts !== 0) return facts & ~ANY_SCRIPT | markScripts
  }
  return facts
}

// Whether a text holds a character whose scripts are cursive, or a mark that gives them: no
// other text has a grapheme that takes no letter spacing. ASCII, which is Latin letters and
// Common characters, has neither.
export function mayHoldCursive(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 0x80) continue
    const facts = getScriptFacts(text.codePointAt(i)!)
    if ((facts & ANY_SCRIPT) === CURSIVE_SCRIPT || (facts >> MARK_SCRIPTS_SHIFT & ANY_SCRIPT) === CURSIVE_SCRIPT) return true
  }
  return false
}

// How far a text's script runs are read, the scripts the run there can be in, and each
// bracket open there: its opening character, then the script of the run it was opened in,
// 0 while that run goes on.
export type ScriptRuns = { read: number, scripts: number, openBrackets: number[] }

// The scripts of the run text[to - 1] is in, read on from the last call as
// ScriptRunIterator::Consume reads them (script_run_iterator.cc:325-429): a run keeps the
// scripts its characters share and ends before one that shares none. A run of no script yet
// takes the script of the first character after it that has one, so the read goes on to that
// character. A closing bracket takes the script of the run its opening bracket is in, once
// that run has ended, among the last 32 opened, and closes the ones opened since; its own
// stays open, so a second closing bracket goes back to that run too (OpenBracket,
// CloseBracket and FixupStack, :431-489, :567-590).
function readScriptRuns(runs: ScriptRuns, text: string, to: number): number {
  const { openBrackets } = runs
  while (runs.read < to || (runs.scripts === ANY_SCRIPT && runs.read < text.length)) {
    const c = text.codePointAt(runs.read)!
    const facts = getScriptFactsAt(text, runs.read)
    let scripts = facts & ANY_SCRIPT
    // No bracket's code is as low as a run's script.
    const opened = (facts & CLOSING_BRACKET) !== 0 ? openBrackets.lastIndexOf(c - (facts >> OPENING_BRACKET_SHIFT)) : -1
    if (opened >= 0) {
      if (openBrackets[opened + 1] !== 0) scripts = openBrackets[opened + 1]!
      openBrackets.length = opened + 2
    }
    if ((runs.scripts & scripts) !== 0) {
      runs.scripts &= scripts
    } else {
      // The run that ends resolves to its first script (ResolveCurrentScript, :639-642), which
      // the brackets opened in it take.
      for (let k = openBrackets.length - 1; k > 0 && openBrackets[k] === 0; k -= 2) openBrackets[k] = runs.scripts & -runs.scripts
      runs.scripts = scripts
    }
    if ((facts & OPENING_BRACKET) !== 0) {
      if (openBrackets.length === 64) openBrackets.splice(0, 2)
      openBrackets.push(c, 0)
    }
    runs.read += c > 0xFFFF ? 2 : 1
  }
  return runs.scripts
}

// Whether the space before the text segment text[at..end) is in the script run of the segment's
// first character past default ignorables, the one it kerns with: a space joins the run of the
// text before it (ScriptRunIterator::MergeSets, :490-510). The nearest character before the
// space that has one script names that run, so the search back starts before the space, at
// text[at - 2], and ends there; a closing bracket, or a character of several scripts, takes its
// script from the runs before it, which are then read.
export function spaceSharesScriptRun(runs: ScriptRuns, text: string, at: number, end: number): boolean {
  let scripts = getScriptFactsAt(text, at) & ANY_SCRIPT
  // A default ignorable with a script of its own, as U+3164, counts as the word's first letter.
  for (let first = at; scripts === ANY_SCRIPT && first + 1 < end && hasProperty(text.charCodeAt(first), DEFAULT_IGNORABLE); first++) scripts = getScriptFactsAt(text, first + 1) & ANY_SCRIPT
  if (scripts === ANY_SCRIPT) return true
  for (let i = at - 2; i >= 0; i--) {
    if ((text.charCodeAt(i) & 0xFC00) === 0xDC00 && i > 0) i--
    const facts = getScriptFactsAt(text, i)
    if ((facts & CLOSING_BRACKET) !== 0) break
    const before = facts & ANY_SCRIPT
    if (before === ANY_SCRIPT) continue
    if ((before & (before - 1)) === 0) return (before & scripts) !== 0
    break
  }
  return (readScriptRuns(runs, text, at) & scripts) !== 0
}

// The scripts whose letters join, Arabic, Syriac, N'Ko, Mandaic, Mongolian, Phags-pa and
// Hanifi Rohingya, take no letter spacing in Blink and Gecko, which name the same seven
// (IsCursiveScript, shape_result.cc:977-990; UnicodeProperties.h:350-355). Gecko asks the
// script of a cluster's first character (GetSpacingInternal, nsTextFrame.cpp:4202-4213), so
// digits and punctuation among the letters keep their spacing. Blink asks the script of the
// shaping run the cluster is in and spaces only its spaces (ComputeSpacing,
// shape_result_spacing.cc:103-131, behind the runtime flag
// IgnoreLetterSpacingInCursiveScripts): a run takes in the characters of no script after
// it, the ones that start the text, and the punctuation its script shares, so of an Arabic
// word, a space and `123.` only the space is spaced. That is Chrome since 149; 138 to 148
// don't space the run's spaces either, and before 138 every letter is spaced, which no
// version check here follows (ENGINE_FOLLOWUPS.md, Letter spacing). WebKit spaces every
// glyph with an advance. Chrome 154, Firefox 156 and webkit-host lay 67 strings out so
// (2026-10-03). The profile's unspacedCursive names the engine's rule. This gives the
// graphemes of the text segment text[start..end) that take no letter spacing, as ascending
// indices, or null without any: in Gecko, which is given no runs, those whose first
// character is a letter of a cursive script; in Blink those whose first character is in a
// run that resolves to one and isn't a no-break space. A rich item's text starts a run of
// its own (ENGINE_FOLLOWUPS.md, Letter spacing).
export function getUnspacedGraphemes(text: string, start: number, end: number, graphemeTable: GraphemeTable, runs: ScriptRuns | null): number[] | null {
  const ends = new Int32Array(end - start)
  const count = findGraphemeEnds(graphemeTable, text, start, end, ends)
  let unspaced: number[] | null = null
  for (let g = 0, at = start; g < count; at = ends[g++]!) {
    const joins = runs === null ? (getScriptFacts(text.codePointAt(at)!) & CURSIVE_LETTER) !== 0
      : readScriptRuns(runs, text, at + 1) === CURSIVE_SCRIPT && text.charCodeAt(at) !== 0xA0
    if (joins) (unspaced ??= []).push(g)
  }
  return unspaced
}
