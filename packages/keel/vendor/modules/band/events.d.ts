import type { Score } from "./score.js";
import type { Part } from "./styles.data.js";
/** One note or hit: its part, MIDI note (0 for drums), length in steps and loudness (0 to 1). */
export interface BandEvent {
    readonly part: Part;
    readonly note: number;
    readonly length: number;
    readonly gain: number;
}
/** The parts playing at an energy: they join in the style's order, the first from silence up. */
export declare function partsAt(score: Score, energy: number): Part[];
/**
 * The events that start on a step.
 *
 * @param score From scoreOf.
 * @param step Sixteenth notes since the start, from 0.
 * @param energy 0 to 1: how many of the style's parts play. Default 1, the whole band.
 * @returns The notes and hits, in no particular order.
 */
export declare function eventsAt(score: Score, step: number, energy?: number): BandEvent[];
