import type { ModeName, Style, StyleName } from "./styles.data.js";
export declare const STEPS_PER_BAR = 16;
/** What a host asks for. Only the seed is needed; anything left out is the seed's choice. */
export interface BandInput {
    readonly seed: number | string;
    readonly style?: StyleName;
    /** Beats per minute, 40 to 200. */
    readonly tempo?: number;
    /** The key note as a pitch class, 0 (C) to 11 (B). */
    readonly key?: number;
    readonly mode?: ModeName;
}
/** One bar's chord: its scale degree, the bass note and the notes the chord part plays, as MIDI numbers. */
export interface Chord {
    readonly degree: number;
    readonly root: number;
    readonly notes: readonly number[];
}
/** Everything fixed for a piece. `eventsAt` reads what plays at any step from it. */
export interface Score {
    readonly seed: number;
    readonly style: StyleName;
    readonly sound: Style;
    readonly tempo: number;
    readonly swing: number;
    readonly key: number;
    readonly mode: ModeName;
    /** One chord per bar; the form repeats. */
    readonly chords: readonly Chord[];
    readonly kick: string;
    readonly snare: string;
    readonly hat: string;
    readonly bass: string;
    /** The lead's contour: eight steps along the scale, relative to the bar's chord. */
    readonly motif: readonly number[];
}
/** The MIDI note of a scale degree (any whole number; it runs on through the octaves) above a base note. */
export declare function noteOf(mode: ModeName, base: number, degree: number): number;
/**
 * The score for a seed: the same input always gives the same piece.
 *
 * @param input The seed, and any of style, tempo, key and mode to pin.
 * @returns The piece's tempo, key, chords, drum and bass rows and lead contour.
 */
export declare function scoreOf(input: BandInput): Score;
